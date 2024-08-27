import {
  rawSql,
  sqlExecutor,
  type Connection,
  type DatabaseTransaction,
} from '../../../core';
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
    getConnection: () => Connection<NodePostgresConnector, DbClient>,
  ) =>
  (
    getClient: Promise<DbClient>,
    options?: { close: (client: DbClient, error?: unknown) => Promise<void> },
  ): DatabaseTransaction<NodePostgresConnector> => {
    const connection = getConnection();
    return {
      connection,
      type: NodePostgresConnectorType,
      begin: async () => {
        await connection.execute.command(rawSql('BEGIN'));
      },
      commit: async () => {
        const client = await connection.open();

        await connection.execute.command(rawSql('COMMIT'));

        if (options?.close) await options?.close(client);
      },
      rollback: async (error?: unknown) => {
        const client = await connection.open();

        await connection.execute.command(rawSql('ROLLBACK'));

        if (options?.close) await options?.close(client, error);
      },
      execute: sqlExecutor(nodePostgresSQLExecutor(), {
        connect: () => getClient,
      }),
    };
  };
