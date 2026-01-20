import {
  SQL,
  sqlExecutor,
  type DatabaseTransaction,
  type InferDbClientFromConnection,
} from '../../../../core';
import { sqliteSQLExecutor } from '../../core/execute';
import {
  transactionNestingCounter,
  type AnySQLiteConnection,
  type SQLiteClientOrPoolClient,
} from '../connections';

export type SQLiteTransaction<
  ConnectionType extends AnySQLiteConnection = AnySQLiteConnection,
> = DatabaseTransaction<ConnectionType>;

export const sqliteTransaction =
  <ConnectionType extends AnySQLiteConnection = AnySQLiteConnection>(
    driverType: ConnectionType['driverType'],
    connection: () => ConnectionType,
    allowNestedTransactions: boolean,
  ) =>
  (
    getClient: Promise<InferDbClientFromConnection<ConnectionType>>,
    options?: {
      close: (
        client: InferDbClientFromConnection<ConnectionType>,
        error?: unknown,
      ) => Promise<void>;
    },
  ): DatabaseTransaction<ConnectionType> => {
    const transactionCounter = transactionNestingCounter();
    return {
      connection: connection(),
      driverType,
      begin: async function () {
        const client = (await getClient) as SQLiteClientOrPoolClient;

        if (allowNestedTransactions) {
          if (transactionCounter.level >= 1) {
            transactionCounter.increment();
            await client.query(
              SQL`SAVEPOINT transaction${SQL.plain(transactionCounter.level.toString())}`,
            );
            return;
          }

          transactionCounter.increment();
        }

        await client.query(SQL`BEGIN TRANSACTION`);
      },
      commit: async function () {
        const client = (await getClient) as SQLiteClientOrPoolClient;

        try {
          if (allowNestedTransactions) {
            if (transactionCounter.level > 1) {
              await client.query(
                SQL`RELEASE transaction${SQL.plain(transactionCounter.level.toString())}`,
              );
              transactionCounter.decrement();

              return;
            }

            transactionCounter.reset();
          }
          await client.query(SQL`COMMIT`);
        } finally {
          if (options?.close)
            await options?.close(
              client as InferDbClientFromConnection<ConnectionType>,
            );
        }
      },
      rollback: async function (error?: unknown) {
        const client = (await getClient) as SQLiteClientOrPoolClient;
        try {
          if (allowNestedTransactions) {
            if (transactionCounter.level > 1) {
              transactionCounter.decrement();
              return;
            }
          }

          await client.query(SQL`ROLLBACK`);
        } finally {
          if (options?.close)
            await options?.close(
              client as InferDbClientFromConnection<ConnectionType>,
              error,
            );
        }
      },
      execute: sqlExecutor(sqliteSQLExecutor(driverType), {
        connect: () => getClient,
      }),
    };
  };
