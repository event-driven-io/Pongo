import type { DatabaseDriverType } from '../drivers';
import type { WithSQLExecutor } from '../execute';
import { type Connection } from './connection';

export interface DatabaseTransaction<
  DriverType extends DatabaseDriverType = DatabaseDriverType,
  DbClient = unknown,
> extends WithSQLExecutor {
  driverType: DriverType;
  connection: Connection<DriverType, DbClient>;
  begin: () => Promise<void>;
  commit: () => Promise<void>;
  rollback: (error?: unknown) => Promise<void>;
}

export interface DatabaseTransactionFactory<
  DriverType extends DatabaseDriverType = DatabaseDriverType,
  DbClient = unknown,
> {
  transaction: () => DatabaseTransaction<DriverType, DbClient>;

  withTransaction: <Result = never>(
    handle: (
      transaction: DatabaseTransaction<DriverType, DbClient>,
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
  DriverType extends DatabaseDriverType = DatabaseDriverType,
  DbClient = unknown,
  Result = void,
>(
  transaction: DatabaseTransaction<DriverType, DbClient>,
  handle: (
    transaction: DatabaseTransaction<DriverType, DbClient>,
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
  DriverType extends DatabaseDriverType = DatabaseDriverType,
  DbClient = unknown,
>(
  connect: () => Promise<DbClient>,
  initTransaction: (
    client: Promise<DbClient>,
    options?: { close: (client: DbClient, error?: unknown) => Promise<void> },
  ) => DatabaseTransaction<DriverType, DbClient>,
): DatabaseTransactionFactory<DriverType, DbClient> => {
  let currentTransaction:
    | DatabaseTransaction<DriverType, DbClient>
    | undefined = undefined;

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
  ConnectionType extends Connection = Connection,
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
  ConnectionType extends Connection = Connection,
>(
  connect: () => ConnectionType,
): DatabaseTransactionFactory<ConnectionType['driverType']> => ({
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
