import { nodePostgresSQLExecutor } from '../../execute';
import { withSqlExecutor } from '../execute';
import type { Transaction } from '../transaction';
import {
  NodePostgresConnectorType,
  type NodePostgresConnector,
  type NodePostgresPoolOrClient,
} from './connection';

export type NodePostgresTransaction = Transaction<NodePostgresConnector>;

export const nodePostgresTransaction = <
  DbClient extends NodePostgresPoolOrClient = NodePostgresPoolOrClient,
>(
  getClient: Promise<DbClient>,
  options?: { close: (client: DbClient, error?: unknown) => Promise<void> },
): Transaction<NodePostgresConnector> => ({
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
  ...withSqlExecutor(nodePostgresSQLExecutor(), { connect: () => getClient }),
});
