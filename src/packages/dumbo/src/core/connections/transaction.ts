import type { WithSQLExecutor } from '../execute';
import type {
  AnyConnection,
  Connection,
  InferDbClientFromConnection,
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

export type DatabaseTransactionOptions = {
  allowNestedTransactions?: boolean;
};

export interface WithDatabaseTransactionFactory<
  ConnectionType extends AnyConnection = AnyConnection,
  TransactionType extends DatabaseTransaction<ConnectionType> =
    DatabaseTransaction<ConnectionType>,
  TransactionOptionsType extends DatabaseTransactionOptions =
    DatabaseTransactionOptions,
> {
  transaction: (options?: TransactionOptionsType) => TransactionType;

  withTransaction: <Result = never>(
    handle: (
      transaction: TransactionType,
    ) => Promise<TransactionResult<Result> | Result>,
    options?: TransactionOptionsType,
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
  DatabaseTransactionType extends AnyDatabaseTransaction =
    AnyDatabaseTransaction,
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
  TransactionType extends DatabaseTransaction<ConnectionType> =
    DatabaseTransaction<ConnectionType>,
  TransactionOptionsType extends DatabaseTransactionOptions =
    DatabaseTransactionOptions,
>(
  connect: () => Promise<InferDbClientFromConnection<ConnectionType>>,
  initTransaction: (
    client: Promise<InferDbClientFromConnection<ConnectionType>>,
    options?: TransactionOptionsType & {
      close: (
        client: InferDbClientFromConnection<ConnectionType>,
        error?: unknown,
      ) => Promise<void>;
    },
  ) => TransactionType,
): WithDatabaseTransactionFactory<
  ConnectionType,
  TransactionType,
  TransactionOptionsType
> => {
  let currentTransaction: TransactionType | undefined = undefined;

  const getOrInitCurrentTransaction = (options?: TransactionOptionsType) =>
    currentTransaction ??
    (currentTransaction = initTransaction(connect(), {
      close: () => {
        currentTransaction = undefined;
        return Promise.resolve();
      },
      ...(options ?? ({} as TransactionOptionsType)),
    }));

  return {
    transaction: getOrInitCurrentTransaction,
    withTransaction: (handle, options) =>
      executeInTransaction(getOrInitCurrentTransaction(options), handle),
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
  TransactionType extends DatabaseTransaction<ConnectionType> =
    DatabaseTransaction<ConnectionType>,
  TransactionOptionsType extends DatabaseTransactionOptions =
    DatabaseTransactionOptions,
>(
  connect: () => ConnectionType,
): WithDatabaseTransactionFactory<
  ConnectionType,
  TransactionType,
  TransactionOptionsType
> => ({
  transaction: (options) => {
    const connection = connect();
    const transaction = connection.transaction(options) as TransactionType;

    return {
      ...transaction,
      commit: () =>
        wrapInConnectionClosure(connection, () => transaction.commit()),
      rollback: () =>
        wrapInConnectionClosure(connection, () => transaction.rollback()),
    };
  },
  withTransaction: (handle, options) => {
    const connection = connect() as unknown as Connection<
      ConnectionType,
      ConnectionType['driverType'],
      InferDbClientFromConnection<ConnectionType>,
      TransactionType,
      TransactionOptionsType
    >;
    return wrapInConnectionClosure(
      connection as unknown as ConnectionType,
      () => connection.withTransaction(handle, options),
    );
  },
});

export const transactionFactoryWithAmbientConnection = <
  ConnectionType extends AnyConnection = AnyConnection,
>(
  connect: () => ConnectionType,
): WithDatabaseTransactionFactory<ConnectionType> => ({
  transaction: (options) => {
    const connection = connect();
    const transaction = connection.transaction(options);

    return {
      ...transaction,
      commit: () => transaction.commit(),
      rollback: () => transaction.rollback(),
    };
  },
  withTransaction: (handle, options) => {
    const connection = connect();
    return connection.withTransaction(handle, options);
  },
});
