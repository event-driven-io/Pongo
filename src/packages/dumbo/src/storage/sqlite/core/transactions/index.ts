import type { SQLiteDriverType } from '..';
import {
  sqlExecutor,
  type Connection,
  type DatabaseTransaction,
} from '../../../../core';
import { sqliteSQLExecutor } from '../../core/execute';
import {
  transactionNestingCounter,
  type SQLiteClientOrPoolClient,
} from '../connections';

export type SQLiteTransaction<
  DriverType extends SQLiteDriverType = SQLiteDriverType,
> = DatabaseTransaction<DriverType>;

export const sqliteTransaction =
  <
    DriverType extends SQLiteDriverType = SQLiteDriverType,
    DbClient extends SQLiteClientOrPoolClient = SQLiteClientOrPoolClient,
  >(
    driverType: DriverType,
    connection: () => Connection<DriverType, DbClient>,
    allowNestedTransactions: boolean,
  ) =>
  (
    getClient: Promise<DbClient>,
    options?: { close: (client: DbClient, error?: unknown) => Promise<void> },
  ): DatabaseTransaction<DriverType, DbClient> => {
    const transactionCounter = transactionNestingCounter();
    return {
      connection: connection(),
      driverType,
      begin: async function () {
        const client = await getClient;

        if (allowNestedTransactions) {
          if (transactionCounter.level >= 1) {
            transactionCounter.increment();
            await client.query(
              `SAVEPOINT transaction${transactionCounter.level}`,
            );
            return;
          }

          transactionCounter.increment();
        }

        await client.query('BEGIN TRANSACTION');
      },
      commit: async function () {
        const client = await getClient;

        try {
          if (allowNestedTransactions) {
            if (transactionCounter.level > 1) {
              await client.query(
                `RELEASE transaction${transactionCounter.level}`,
              );
              transactionCounter.decrement();

              return;
            }

            transactionCounter.reset();
          }
          await client.query('COMMIT');
        } finally {
          if (options?.close) await options?.close(client);
        }
      },
      rollback: async function (error?: unknown) {
        const client = await getClient;
        try {
          if (allowNestedTransactions) {
            if (transactionCounter.level > 1) {
              transactionCounter.decrement();
              return;
            }
          }

          await client.query('ROLLBACK');
        } finally {
          if (options?.close) await options?.close(client, error);
        }
      },
      execute: sqlExecutor(sqliteSQLExecutor(driverType), {
        connect: () => getClient,
      }),
    };
  };
