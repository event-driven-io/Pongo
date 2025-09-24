import {
  sqlExecutor,
  type Connection,
  type DatabaseTransaction,
} from '../../../../core';
import { nodePostgresSQLExecutor } from '../execute';
import {
  NodePostgresDriverType,
  type NodePostgresPoolOrClient,
} from './connection';

export type NodePostgresTransaction =
  DatabaseTransaction<NodePostgresDriverType>;

export const nodePostgresTransaction =
  <DbClient extends NodePostgresPoolOrClient = NodePostgresPoolOrClient>(
    connection: () => Connection<NodePostgresDriverType, DbClient>,
  ) =>
  (
    getClient: Promise<DbClient>,
    options?: { close: (client: DbClient, error?: unknown) => Promise<void> },
  ): DatabaseTransaction<NodePostgresDriverType, DbClient> => ({
    connection: connection(),
    driverType: NodePostgresDriverType,
    begin: async () => {
      const client = await getClient;
      await client.query('BEGIN');
    },
    commit: async () => {
      const client = await getClient;

      try {
        await client.query('COMMIT');
      } finally {
        if (options?.close) await options?.close(client);
      }
    },
    rollback: async (error?: unknown) => {
      const client = await getClient;
      try {
        await client.query('ROLLBACK');
      } finally {
        if (options?.close) await options?.close(client, error);
      }
    },
    execute: sqlExecutor(nodePostgresSQLExecutor(), {
      connect: () => getClient,
    }),
  });
