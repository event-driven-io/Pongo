import type { WithSQLExecutor } from '../execute';
import { type Connection } from './connection';

export type Transaction<ConnectorType extends string = string> = {
  type: ConnectorType;
  begin: () => Promise<void>;
  commit: () => Promise<void>;
  rollback: (error?: unknown) => Promise<void>;
} & WithSQLExecutor;

export type TransactionFactory<ConnectorType extends string = string> = {
  transaction: () => Transaction<ConnectorType>;

  inTransaction: <Result = unknown>(
    handle: (
      transaction: Transaction<ConnectorType>,
    ) => Promise<{ success: boolean; result: Result }>,
  ) => Promise<Result>;
};

export const executeInTransaction = async <
  ConnectorType extends string = string,
  Result = unknown,
>(
  transaction: Transaction<ConnectorType>,
  handle: (
    transaction: Transaction<ConnectorType>,
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
  initTransaction: (client: Promise<DbClient>) => Transaction<ConnectorType>,
): TransactionFactory<ConnectorType> => ({
  transaction: () => initTransaction(connect()),
  inTransaction: (handle) =>
    executeInTransaction(initTransaction(connect()), handle),
});

export const transactionFactoryWithNewConnection = <
  ConnectionType extends Connection = Connection,
>(
  connect: () => ConnectionType,
): TransactionFactory<ConnectionType['type']> => ({
  transaction: () => connect().transaction(),
  inTransaction: async (handle) => {
    const connection = connect();
    try {
      return await connection.inTransaction(handle);
    } finally {
      await connection.close();
    }
  },
});
