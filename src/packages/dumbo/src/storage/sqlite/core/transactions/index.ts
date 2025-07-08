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
    allowNestedTransactions: boolean,
  ) =>
  (
    getClient: Promise<DbClient>,
    options?: { close: (client: DbClient, error?: unknown) => Promise<void> },
  ): DatabaseTransaction<ConnectorType, DbClient> => ({
    connection: connection(),
    connector,
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

      if (allowNestedTransactions) {
        if (transactionCounter.level > 1) {
          await client.query(`RELEASE transaction${transactionCounter.level}`);
          transactionCounter.decrement();

          return;
        }

        transactionCounter.reset();
      }
      await client.query('COMMIT');

      if (options?.close) await options?.close(client);
    },
    rollback: async function (error?: unknown) {
      const client = await getClient;

      if (allowNestedTransactions) {
        if (transactionCounter.level > 1) {
          transactionCounter.decrement();
          return;
        }
      }

      await client.query('ROLLBACK');

      if (options?.close) await options?.close(client, error);
    },
    execute: sqlExecutor(sqliteSQLExecutor(connector), {
      connect: () => getClient,
    }),
  });
