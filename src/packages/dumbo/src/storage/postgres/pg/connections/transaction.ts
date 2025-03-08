import {
  sqlExecutor,
  type Connection,
  type DatabaseTransaction,
} from '../../../../core';
import { nodePostgresSQLExecutor } from '../execute';
import {
  NodePostgresConnectorType,
  type NodePostgresConnector,
  type NodePostgresPoolOrClient,
} from './connection';

export type NodePostgresTransaction =
  DatabaseTransaction<NodePostgresConnector>;

export const nodePostgresTransaction =
  <DbClient extends NodePostgresPoolOrClient = NodePostgresPoolOrClient>(
    connection: () => Connection<NodePostgresConnector, DbClient>,
  ) =>
  (
    getClient: Promise<DbClient>,
    options?: { close: (client: DbClient, error?: unknown) => Promise<void> },
  ): DatabaseTransaction<NodePostgresConnector> => ({
    connection: connection(),
    type: NodePostgresConnectorType,
    begin: async () => {
      const client = await getClient;
      await client.query('BEGIN');
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
    execute: sqlExecutor(nodePostgresSQLExecutor(), {
      connect: () => getClient,
    }),
  });
