import pg from 'pg';
import { createConnectionPool, type ConnectionPool } from '../../../core';
import {
  defaultPostgreSqlDatabase,
  getDatabaseNameOrDefault,
} from '../../core';
import {
  nodePostgresConnection,
  NodePostgresConnectorType,
  type NodePostgresClientConnection,
  type NodePostgresPoolClientConnection,
} from './connection';

export type NodePostgresNativePool =
  ConnectionPool<NodePostgresPoolClientConnection>;

export type NodePostgresExplicitClientPool =
  ConnectionPool<NodePostgresClientConnection>;

export type NodePostgresExplicitConnectionPool = ConnectionPool<
  NodePostgresPoolClientConnection | NodePostgresClientConnection
>;

export const nodePostgresNativePool = (options: {
  connectionString: string;
  database?: string | undefined;
}): NodePostgresNativePool => {
  const { connectionString, database } = options;
  const pool = getPool({ connectionString, database });

  const getConnection = () =>
    nodePostgresConnection({
      type: 'PoolClient',
      connect: pool.connect(),
      close: (client) => Promise.resolve(client.release()),
    });

  const open = () => Promise.resolve(getConnection());
  const close = () => endPool({ connectionString, database });

  return createConnectionPool({
    type: NodePostgresConnectorType,
    connection: open,
    close,
    getConnection,
  });
};

export const nodePostgresAmbientNativePool = (options: {
  pool: pg.Pool;
}): NodePostgresNativePool => {
  const { pool } = options;

  return createConnectionPool({
    type: NodePostgresConnectorType,
    getConnection: () =>
      nodePostgresConnection({
        type: 'PoolClient',
        connect: pool.connect(),
        close: (client) => Promise.resolve(client.release()),
      }),
  });
};

export const nodePostgresAmbientConnectionPool = (options: {
  connection: NodePostgresPoolClientConnection | NodePostgresClientConnection;
}): NodePostgresExplicitConnectionPool => {
  const { connection } = options;

  return createConnectionPool({
    type: NodePostgresConnectorType,
    getConnection: () => connection,
    execute: connection.execute,
    transaction: () => connection.transaction(),
    withTransaction: (handle) => connection.withTransaction(handle),
  });
};

export const nodePostgresClientPool = (options: {
  connectionString: string;
  database?: string | undefined;
}): NodePostgresExplicitClientPool => {
  const { connectionString, database } = options;

  return createConnectionPool({
    type: NodePostgresConnectorType,
    getConnection: () => {
      const connect = Promise.resolve(
        new pg.Client({ connectionString, database }),
      ).then(async (client) => {
        await client.connect();
        return client;
      });

      return nodePostgresConnection({
        type: 'Client',
        connect,
        close: (client) => client.end(),
      });
    },
  });
};

export const nodePostgresAmbientClientPool = (options: {
  client: pg.Client;
}): NodePostgresExplicitClientPool => {
  const { client } = options;

  const getConnection = () => {
    const connect = Promise.resolve(client);

    return nodePostgresConnection({
      type: 'Client',
      connect,
      close: () => Promise.resolve(),
    });
  };

  const open = () => Promise.resolve(getConnection());
  const close = () => Promise.resolve();

  return createConnectionPool({
    type: NodePostgresConnectorType,
    connection: open,
    close,
    getConnection,
  });
};

export type NodePostgresPoolPooledOptions =
  | {
      connectionString: string;
      database?: string;
      pooled: true;
      pool: pg.Pool;
    }
  | {
      connectionString: string;
      database?: string;
      pool: pg.Pool;
    }
  | {
      connectionString: string;
      database?: string;
      pooled: true;
    }
  | {
      connectionString: string;
      database?: string;
    };

export type NodePostgresPoolNotPooledOptions =
  | {
      connectionString: string;
      database?: string;
      pooled: false;
      client: pg.Client;
    }
  | {
      connectionString: string;
      database?: string;
      client: pg.Client;
    }
  | {
      connectionString: string;
      database?: string;
      pooled: false;
    }
  | {
      connectionString: string;
      database?: string;
      connection:
        | NodePostgresPoolClientConnection
        | NodePostgresClientConnection;
      pooled?: false;
    };

export type NodePostgresPoolOptions =
  | NodePostgresPoolPooledOptions
  | NodePostgresPoolNotPooledOptions;

export function nodePostgresPool(
  options: NodePostgresPoolPooledOptions,
): NodePostgresNativePool;
export function nodePostgresPool(
  options: NodePostgresPoolNotPooledOptions,
): NodePostgresExplicitClientPool;
export function nodePostgresPool(
  options: NodePostgresPoolOptions,
):
  | NodePostgresNativePool
  | NodePostgresExplicitClientPool
  | NodePostgresExplicitConnectionPool {
  const { connectionString, database } = options;

  if ('client' in options && options.client)
    return nodePostgresAmbientClientPool({ client: options.client });

  if ('pooled' in options && options.pooled === false)
    return nodePostgresClientPool({ connectionString, database });

  if ('connection' in options && options.connection)
    return nodePostgresAmbientConnectionPool({
      connection: options.connection,
    });

  if ('pool' in options && options.pool)
    return nodePostgresAmbientNativePool({ pool: options.pool });

  return nodePostgresNativePool({
    connectionString,
    database,
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
