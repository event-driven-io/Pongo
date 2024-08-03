import type { WithSQLExecutor } from '../execute';
import { type Connection } from './connection';

export interface DatabaseTransaction<ConnectorType extends string = string>
  extends WithSQLExecutor {
  type: ConnectorType;
  begin: () => Promise<void>;
  commit: () => Promise<void>;
  rollback: (error?: unknown) => Promise<void>;
}

export interface DatabaseTransactionFactory<
  ConnectorType extends string = string,
> {
  transaction: () => DatabaseTransaction<ConnectorType>;

  withTransaction: <Result = unknown>(
    handle: (
      transaction: DatabaseTransaction<ConnectorType>,
    ) => Promise<{ success: boolean; result: Result }>,
  ) => Promise<Result>;
}

export const executeInTransaction = async <
  ConnectorType extends string = string,
  Result = unknown,
>(
  transaction: DatabaseTransaction<ConnectorType>,
  handle: (
    transaction: DatabaseTransaction<ConnectorType>,
  ) => Promise<{ success: boolean; result: Result }>,
): Promise<Result> => {
  await transaction.begin();

  try {
    const { success, result } = await handle(transaction);

    if (success) await transaction.commit();
    else await transaction.rollback();

    return result;
  } catch (e) {
    await transaction.rollback();
    throw e;
  }
};

export const transactionFactoryWithDbClient = <
  ConnectorType extends string = string,
  DbClient = unknown,
>(
  connect: () => Promise<DbClient>,
  initTransaction: (
    client: Promise<DbClient>,
  ) => DatabaseTransaction<ConnectorType>,
): DatabaseTransactionFactory<ConnectorType> => ({
  transaction: () => initTransaction(connect()),
  withTransaction: (handle) =>
    executeInTransaction(initTransaction(connect()), handle),
});

export const transactionFactoryWithNewConnection = <
  ConnectionType extends Connection = Connection,
>(
  connect: () => ConnectionType,
): DatabaseTransactionFactory<ConnectionType['type']> => ({
  transaction: () => connect().transaction(),
  withTransaction: async (handle) => {
    const connection = connect();
    try {
      return await connection.withTransaction(handle);
    } finally {
      await connection.close();
    }
  },
});
