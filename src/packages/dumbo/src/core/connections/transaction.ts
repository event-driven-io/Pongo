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

export const transactionFactory = <
  ConnectorType extends string = string,
  DbClient = unknown,
>(
  connect: () => Promise<DbClient>,
  initTransaction: (client: Promise<DbClient>) => Transaction<ConnectorType>,
): TransactionFactory<ConnectorType> => ({
  transaction: () => initTransaction(connect()),
  inTransaction: async <Result = unknown>(
    handle: (
      transaction: Transaction<ConnectorType>,
    ) => Promise<{ success: boolean; result: Result }>,
  ): Promise<Result> => {
    const transaction = initTransaction(connect());

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
  },
});

export const transactionFactoryWithNewConnection = <
  ConnectionType extends Connection = Connection,
>(
  connectionFactory: () => ConnectionType,
  initTransaction: (
    client: Promise<ReturnType<ConnectionType['connect']>>,
    options?: {
      close: (
        client: ReturnType<ConnectionType['connect']>,
        error?: unknown,
      ) => Promise<void>;
    },
  ) => Transaction<ConnectionType['type']>,
): TransactionFactory<ConnectionType['type']> => ({
  transaction: () => {
    const connection = connectionFactory();

    return initTransaction(
      connection.connect() as Promise<ReturnType<ConnectionType['connect']>>,
      {
        close: () => connection.close(),
      },
    );
  },
  inTransaction: async <Result = unknown>(
    handle: (
      transaction: Transaction<ConnectionType['type']>,
    ) => Promise<{ success: boolean; result: Result }>,
  ): Promise<Result> => {
    const connection = connectionFactory();
    const transaction = initTransaction(
      connection.connect() as Promise<ReturnType<ConnectionType['connect']>>,
      {
        close: () => connection.close(),
      },
    );

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
  },
});
