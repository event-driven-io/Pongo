import pg from 'pg';
import {
  queryWithNewConnection,
  type ConnectionPool,
  type SQL,
  type Transaction,
} from '../../../core';
import {
  defaultPostgreSqlDatabase,
  getDatabaseNameOrDefault,
} from '../../core';
import {
  nodePostgresConnection,
  NodePostgresConnectorType,
  type NodePostgresClientConnection,
  type NodePostgresConnector,
  type NodePostgresPoolClientConnection,
} from './connection';

export type NodePostgresNativePool =
  ConnectionPool<NodePostgresPoolClientConnection>;

export type NodePostgresExplicitClientPool =
  ConnectionPool<NodePostgresClientConnection>;

export const nodePostgresNativePool = (options: {
  connectionString: string;
  database?: string;
  pool?: pg.Pool;
}): NodePostgresNativePool => {
  const { connectionString, database, pool: existingPool } = options;
  const pool = existingPool
    ? existingPool
    : getPool({ connectionString, database });

  const getConnection = () => {
    const connect = pool.connect();

    return nodePostgresConnection({
      type: 'PoolClient',
      connect,
      close: (client) => Promise.resolve(client.release()),
    });
  };

  const open = () => Promise.resolve(getConnection());
  const close = async () => {
    if (!existingPool) await endPool({ connectionString, database });
  };

  return {
    type: NodePostgresConnectorType,
    open,
    close,
    execute: {
      query: async (sql: SQL) => queryWithNewConnection({ open }, sql),
    },
    transaction: () => getConnection().transaction(),
    inTransaction: async <Result = unknown>(
      handle: (
        transaction: Transaction<NodePostgresConnector>,
      ) => Promise<{ success: boolean; result: Result }>,
    ): Promise<Result> => {
      const connection = getConnection();
      try {
        return await connection.inTransaction(handle);
      } finally {
        await connection.close();
      }
    },
  };
};

export const nodePostgresExplicitClientPool = (options: {
  connectionString: string;
  database?: string;
  client?: pg.Client;
}): NodePostgresExplicitClientPool => {
  const { connectionString, database, client: existingClient } = options;

  const getConnection = () => {
    const connect = existingClient
      ? Promise.resolve(existingClient)
      : Promise.resolve(new pg.Client({ connectionString, database })).then(
          async (client) => {
            await client.connect();
            return client;
          },
        );

    return nodePostgresConnection({
      type: 'Client',
      connect,
      close: (client) => (existingClient ? Promise.resolve() : client.end()),
    });
  };

  const open = () => Promise.resolve(getConnection());
  const close = async () => {
    if (!existingClient) await endPool({ connectionString, database });
  };

  return {
    type: NodePostgresConnectorType,
    open,
    close,
    execute: {
      query: (sql: SQL) => queryWithNewConnection({ open }, sql),
    },
    transaction: () => getConnection().transaction(),
    inTransaction: async <Result = unknown>(
      handle: (
        transaction: Transaction<NodePostgresConnector>,
      ) => Promise<{ success: boolean; result: Result }>,
    ): Promise<Result> => {
      const connection = getConnection();
      try {
        return await connection.inTransaction(handle);
      } finally {
        await connection.close();
      }
    },
  };
};

export function nodePostgresPool(options: {
  connectionString: string;
  database?: string;
  type: 'pooled';
  pool: pg.Pool;
}): NodePostgresNativePool;
export function nodePostgresPool(options: {
  connectionString: string;
  database?: string;
  pool: pg.Pool;
}): NodePostgresNativePool;
export function nodePostgresPool(options: {
  connectionString: string;
  database?: string;
  type: 'pooled';
}): NodePostgresNativePool;
export function nodePostgresPool(options: {
  connectionString: string;
  database?: string;
}): NodePostgresNativePool;
export function nodePostgresPool(options: {
  connectionString: string;
  database?: string;
  type: 'client';
  client: pg.Client;
}): NodePostgresExplicitClientPool;
export function nodePostgresPool(options: {
  connectionString: string;
  database?: string;
  client: pg.Client;
}): NodePostgresExplicitClientPool;
export function nodePostgresPool(options: {
  connectionString: string;
  database?: string;
  type: 'client';
}): NodePostgresExplicitClientPool;
export function nodePostgresPool(options: {
  connectionString: string;
  database?: string;
  type?: 'pooled' | 'client';
  pool?: pg.Pool;
  client?: pg.Client;
}): NodePostgresNativePool | NodePostgresExplicitClientPool {
  const { connectionString, database } = options;

  if (options.type === 'client' || 'client' in options)
    return nodePostgresExplicitClientPool({
      connectionString,
      ...(database ? { database } : {}),
      ...('client' in options && options.client
        ? { client: options.client }
        : {}),
    });

  return nodePostgresNativePool({
    connectionString,
    ...(database ? { database } : {}),
    ...('pool' in options && options.pool ? { pool: options.pool } : {}),
  });
}

const pools: Map<string, pg.Pool> = new Map();
const usageCounter: Map<string, number> = new Map();

export const getPool = (
  connectionStringOrOptions: string | pg.PoolConfig,
): pg.Pool => {
  const connectionString =
    typeof connectionStringOrOptions === 'string'
      ? connectionStringOrOptions
      : connectionStringOrOptions.connectionString!;

  const poolOptions =
    typeof connectionStringOrOptions === 'string'
      ? { connectionString }
      : connectionStringOrOptions;

  const database =
    poolOptions.database ??
    (poolOptions.connectionString
      ? getDatabaseNameOrDefault(poolOptions.connectionString)
      : undefined);

  const lookupKey = key(connectionString, database);

  updatePoolUsageCounter(lookupKey, 1);

  return (
    pools.get(lookupKey) ??
    pools.set(lookupKey, new pg.Pool(poolOptions)).get(lookupKey)!
  );
};

export const endPool = async ({
  connectionString,
  database,
  force,
}: {
  connectionString: string;
  database?: string | undefined;
  force?: boolean;
}): Promise<void> => {
  database = database ?? getDatabaseNameOrDefault(connectionString);
  const lookupKey = key(connectionString, database);

  const pool = pools.get(lookupKey);
  if (pool && (updatePoolUsageCounter(lookupKey, -1) <= 0 || force === true)) {
    await onEndPool(lookupKey, pool);
  }
};

export const onEndPool = async (lookupKey: string, pool: pg.Pool) => {
  try {
    await pool.end();
  } catch (error) {
    console.log(`Error while closing the connection pool: ${lookupKey}`);
    console.log(error);
  }
  pools.delete(lookupKey);
};

export const endAllPools = () =>
  Promise.all(
    [...pools.entries()].map(([lookupKey, pool]) => onEndPool(lookupKey, pool)),
  );

const key = (connectionString: string, database: string | undefined) =>
  `${connectionString}|${database ?? defaultPostgreSqlDatabase}`;

const updatePoolUsageCounter = (lookupKey: string, by: 1 | -1): number => {
  const currentCounter = usageCounter.get(lookupKey) ?? 0;
  const newCounter = currentCounter + by;

  usageCounter.set(lookupKey, currentCounter + by);

  return newCounter;
};
