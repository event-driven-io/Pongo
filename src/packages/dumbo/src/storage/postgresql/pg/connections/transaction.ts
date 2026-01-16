import {
  sqlExecutor,
  type AnyConnection,
  type DatabaseTransaction,
} from '../../../../core';
import { nodePostgresSQLExecutor } from '../execute';
import {
  NodePostgresDriverType,
  type NodePostgresConnection,
  type NodePostgresPoolOrClient,
} from './connection';

export type NodePostgresTransaction =
  DatabaseTransaction<NodePostgresConnection>;

export const nodePostgresTransaction =
  <ConnectionType extends AnyConnection = AnyConnection>(
    connection: () => ConnectionType,
  ) =>
  <DbClient extends NodePostgresPoolOrClient = NodePostgresPoolOrClient>(
    getClient: Promise<DbClient>,
    options?: {
      close: (client: DbClient, error?: unknown) => Promise<void>;
    },
  ): DatabaseTransaction<ConnectionType> => ({
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
