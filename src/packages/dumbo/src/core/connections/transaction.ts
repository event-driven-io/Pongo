import type { WithSQLExecutor } from '../execute';
import {
  type AnyConnection,
  type InferDbClientFromConnection,
} from './connection';

export interface DatabaseTransaction<
  ConnectionType extends AnyConnection = AnyConnection,
> extends WithSQLExecutor {
  driverType: ConnectionType['driverType'];
  connection: ConnectionType;
  begin: () => Promise<void>;
  commit: () => Promise<void>;
  rollback: (error?: unknown) => Promise<void>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyDatabaseTransaction = DatabaseTransaction<any>;

export interface WithDatabaseTransactionFactory<
  ConnectionType extends AnyConnection = AnyConnection,
  TransactionType extends
    DatabaseTransaction<ConnectionType> = DatabaseTransaction<ConnectionType>,
> {
  transaction: () => TransactionType;

  withTransaction: <Result = never>(
    handle: (
      transaction: TransactionType,
    ) => Promise<TransactionResult<Result> | Result>,
  ) => Promise<Result>;
}

export type TransactionResult<Result> = { success: boolean; result: Result };

const toTransactionResult = <Result>(
  transactionResult: TransactionResult<Result> | Result,
): TransactionResult<Result> =>
  transactionResult !== undefined &&
  transactionResult !== null &&
  typeof transactionResult === 'object' &&
  'success' in transactionResult
    ? transactionResult
    : { success: true, result: transactionResult };

export const executeInTransaction = async <
  DatabaseTransactionType extends
    AnyDatabaseTransaction = AnyDatabaseTransaction,
  Result = void,
>(
  transaction: DatabaseTransactionType,
  handle: (
    transaction: DatabaseTransactionType,
  ) => Promise<TransactionResult<Result> | Result>,
): Promise<Result> => {
  await transaction.begin();

  try {
    const { success, result } = toTransactionResult(await handle(transaction));

    if (success) await transaction.commit();
    else await transaction.rollback();

    return result;
  } catch (e) {
    await transaction.rollback();
    throw e;
  }
};

export const transactionFactoryWithDbClient = <
  ConnectionType extends AnyConnection = AnyConnection,
  TransactionType extends
    DatabaseTransaction<ConnectionType> = DatabaseTransaction<ConnectionType>,
>(
  connect: () => Promise<InferDbClientFromConnection<ConnectionType>>,
  initTransaction: (
    client: Promise<InferDbClientFromConnection<ConnectionType>>,
    options?: {
      close: (
        client: InferDbClientFromConnection<ConnectionType>,
        error?: unknown,
      ) => Promise<void>;
    },
  ) => TransactionType,
): WithDatabaseTransactionFactory<ConnectionType, TransactionType> => {
  let currentTransaction: TransactionType | undefined = undefined;

  const getOrInitCurrentTransaction = () =>
    currentTransaction ??
    (currentTransaction = initTransaction(connect(), {
      close: () => {
        currentTransaction = undefined;
        return Promise.resolve();
      },
    }));

  return {
    transaction: getOrInitCurrentTransaction,
    withTransaction: (handle) =>
      executeInTransaction(getOrInitCurrentTransaction(), handle),
  };
};

const wrapInConnectionClosure = async <
  ConnectionType extends AnyConnection = AnyConnection,
  Result = unknown,
>(
  connection: ConnectionType,
  handle: () => Promise<Result>,
) => {
  try {
    return await handle();
  } finally {
    await connection.close();
  }
};

export const transactionFactoryWithNewConnection = <
  ConnectionType extends AnyConnection = AnyConnection,
>(
  connect: () => ConnectionType,
): WithDatabaseTransactionFactory<ConnectionType> => ({
  transaction: () => {
    const connection = connect();
    const transaction = connection.transaction();

    return {
      ...transaction,
      commit: () =>
        wrapInConnectionClosure(connection, () => transaction.commit()),
      rollback: () =>
        wrapInConnectionClosure(connection, () => transaction.rollback()),
    };
  },
  withTransaction: (handle) => {
    const connection = connect();
    return wrapInConnectionClosure(connection, () =>
      connection.withTransaction(handle),
    );
  },
});

export const transactionFactoryWithAmbientConnection = <
  ConnectionType extends AnyConnection = AnyConnection,
>(
  connect: () => ConnectionType,
): WithDatabaseTransactionFactory<ConnectionType> => ({
  transaction: () => {
    const connection = connect();
    const transaction = connection.transaction();

    return {
      ...transaction,
      commit: () => transaction.commit(),
      rollback: () => transaction.rollback(),
    };
  },
  withTransaction: (handle) => {
    const connection = connect();
    return connection.withTransaction(handle);
  },
});
