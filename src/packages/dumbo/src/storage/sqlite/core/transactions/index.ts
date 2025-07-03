import type { SQLiteConnectorType } from '..';
import {
  sqlExecutor,
  type Connection,
  type DatabaseTransaction,
} from '../../../../core';
import { sqliteSQLExecutor } from '../../core/execute';
import type {
  SQLiteClientOrPoolClient,
  TransactionNestingCounter,
} from '../connections';

export type SQLiteTransaction<
  ConnectorType extends SQLiteConnectorType = SQLiteConnectorType,
> = DatabaseTransaction<ConnectorType>;

export const sqliteTransaction =
  <
    ConnectorType extends SQLiteConnectorType = SQLiteConnectorType,
    DbClient extends SQLiteClientOrPoolClient = SQLiteClientOrPoolClient,
  >(
    connector: ConnectorType,
    connection: () => Connection<ConnectorType, DbClient>,
    transactionCounter: TransactionNestingCounter,
  ) =>
  (
    getClient: Promise<DbClient>,
    options?: { close: (client: DbClient, error?: unknown) => Promise<void> },
  ): DatabaseTransaction<ConnectorType, DbClient> => ({
    connection: connection(),
    connector,
    begin: async function () {
      const client = await getClient;

      if (transactionCounter.level >= 1) {
        try {
          transactionCounter.increment();
          await client.query(
            `SAVEPOINT transaction${transactionCounter.level}`,
          );
        } catch (error) {
          console.log('Rolling back begin commit');
          await this.rollback(error);
          throw error;
        }
        return;
      }

      transactionCounter.increment();
      await client.query('BEGIN TRANSACTION');
    },
    commit: async function () {
      const client = await getClient;

      if (transactionCounter.level > 1) {
        try {
          await client.query(`RELEASE transaction${transactionCounter.level}`);
          transactionCounter.decrement();
        } catch (error) {
          console.log(error);
          await this.rollback(error);
        }

        return;
      }

      await client.query('COMMIT');
      transactionCounter.reset();

      if (options?.close) await options?.close(client);
    },
    rollback: async function (error?: unknown) {
      const client = await getClient;
      transactionCounter.reset();
      await client.query('ROLLBACK');

      if (options?.close) await options?.close(client, error);
    },
    execute: sqlExecutor(sqliteSQLExecutor(connector), {
      connect: () => getClient,
    }),
  });
