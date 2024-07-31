import pg from 'pg';
import type { Connection, Transaction } from '../connection';
import { endPool, getPool } from '../pool';

export const NodePostgresConnectorType = 'PostgreSQL:pg';
export type NodePostgresConnector = 'PostgreSQL:pg';

export type NodePostgresClient = pg.PoolClient | pg.Client;

export type NodePostgresPoolOrClient = pg.Pool | pg.PoolClient | pg.Client;

export type NodePostgresPoolConnection = Connection<
  'PostgreSQL:pg',
  pg.PoolClient
> & {
  pool: pg.Pool;
};

export type NodePostgresClientConnection = Connection<
  NodePostgresConnector,
  pg.Client
> & {
  client: Promise<pg.Client>;
};

export type NodePostgresTransaction<
  DbClient extends NodePostgresPoolOrClient = NodePostgresPoolOrClient,
> = Transaction<NodePostgresConnector, DbClient>;

export type NodePostgresConnection = NodePostgresPoolConnection;

export const NodePostgresTransaction = <
  DbClient extends NodePostgresPoolOrClient = NodePostgresPoolOrClient,
>(
  client: Promise<DbClient>,
): NodePostgresTransaction<DbClient> => ({
  type: NodePostgresConnectorType,
  client,
  begin: async () => {
    await (await client).query('BEGIN');
  },
  commit: async () => {
    await (await client).query('COMMIT');
  },
  rollback: async () => {
    await (await client).query('ROLLBACK');
  },
});

export const NodePostgresPoolConnection = (options: {
  connectionString: string;
  database?: string;
  pool?: pg.Pool;
}): NodePostgresPoolConnection => {
  const { connectionString, database, pool: existingPool } = options;
  const pool = existingPool
    ? existingPool
    : getPool({ connectionString, database });

  let poolClient: pg.PoolClient | null = null;
  const connect = async () =>
    (poolClient = poolClient ?? (await pool.connect()));

  return {
    type: NodePostgresConnectorType,
    pool,
    open: connect,
    close: async () => {
      if (poolClient) {
        poolClient.release();
        poolClient = null;
      }

      if (!existingPool) await endPool({ connectionString, database });
    },
    beginTransaction: () => Promise.resolve(NodePostgresTransaction(connect())),
  };
};

export const nodePostgresClientConnection = (options: {
  connectionString: string;
  database?: string;
  client?: pg.Client;
}): NodePostgresClientConnection => {
  const { connectionString, database, client: existingClient } = options;

  let client: pg.Client | null = existingClient ?? null;

  const getClient = async () => {
    if (client) return client;

    client = new pg.Client({ connectionString, database });

    if (!existingClient) await client.connect();

    return client;
  };

  return {
    type: NodePostgresConnectorType,
    get client() {
      return getClient();
    },
    open: getClient,
    close: async () => {
      const connectedClient = await getClient();

      if (!existingClient) await connectedClient.end();
    },
    beginTransaction: () =>
      Promise.resolve(NodePostgresTransaction(getClient())),
  };
};

export function pgConnection(options: {
  connectionString: string;
  database?: string;
  type: 'pooled';
  pool: pg.Pool;
}): NodePostgresPoolConnection;
export function pgConnection(options: {
  connectionString: string;
  database?: string;
  pool: pg.Pool;
}): NodePostgresPoolConnection;
export function pgConnection(options: {
  connectionString: string;
  database?: string;
  type: 'pooled';
}): NodePostgresPoolConnection;
export function pgConnection(options: {
  connectionString: string;
  database?: string;
}): NodePostgresPoolConnection;
export function pgConnection(options: {
  connectionString: string;
  database?: string;
  type: 'client';
  client: pg.Client;
}): NodePostgresClientConnection;
export function pgConnection(options: {
  connectionString: string;
  database?: string;
  client: pg.Client;
}): NodePostgresClientConnection;
export function pgConnection(options: {
  connectionString: string;
  database?: string;
  type: 'client';
}): NodePostgresClientConnection;
export function pgConnection(options: {
  connectionString: string;
  database?: string;
  type?: 'pooled' | 'client';
  pool?: pg.Pool;
  client?: pg.Client;
}): NodePostgresPoolConnection | NodePostgresClientConnection {
  const { connectionString, database } = options;

  if (options.type === 'client' || 'client' in options)
    return nodePostgresClientConnection({
      connectionString,
      ...(database ? { database } : {}),
      ...('client' in options && options.client
        ? { client: options.client }
        : {}),
    });

  return NodePostgresPoolConnection({
    connectionString,
    ...(database ? { database } : {}),
    ...('pool' in options && options.pool ? { pool: options.pool } : {}),
  });
}
