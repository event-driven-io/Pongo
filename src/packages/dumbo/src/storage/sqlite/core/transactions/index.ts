import type { SQLiteConnectorType } from '..';
import {
  sqlExecutor,
  type Connection,
  type DatabaseTransaction,
} from '../../../../core';
import { sqliteSQLExecutor } from '../../core/execute';
import type { SQLiteClientOrPoolClient } from '../connections';

export type SQLiteTransaction<
  ConnectorType extends SQLiteConnectorType = SQLiteConnectorType,
> = DatabaseTransaction<ConnectorType>;

export const sqliteTransaction =
  <
    ConnectorType extends SQLiteConnectorType = SQLiteConnectorType,
    DbClient extends SQLiteClientOrPoolClient = SQLiteClientOrPoolClient,
  >(
    connectorType: ConnectorType,
    connection: () => Connection<ConnectorType, DbClient>,
  ) =>
  (
    getClient: Promise<DbClient>,
    options?: { close: (client: DbClient, error?: unknown) => Promise<void> },
  ): DatabaseTransaction<ConnectorType> => ({
    connection: connection(),
    type: connectorType,
    begin: async () => {
      const client = await getClient;
      await client.query('BEGIN TRANSACTION');
    },
    commit: async () => {
      const client = await getClient;

      await client.query('COMMIT');

      if (options?.close) await options?.close(client);
    },
    rollback: async (error?: unknown) => {
      const client = await getClient;
      await client.query('ROLLBACK');

      if (options?.close) await options?.close(client, error);
    },
    execute: sqlExecutor(sqliteSQLExecutor(connectorType), {
      connect: () => getClient,
    }),
  });
