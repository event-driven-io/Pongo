import pg from 'pg';
import {
  createConnectionPool,
  JSONSerializer,
  tracer,
  type ConnectionPool,
} from '../../../../core';
import {
  defaultPostgreSqlDatabase,
  getDatabaseNameOrDefault,
} from '../../core';
import { setNodePostgresTypeParser } from '../serialization';
import {
  nodePostgresConnection,
  NodePostgresConnectorType,
  type NodePostgresClientConnection,
  type NodePostgresConnector,
  type NodePostgresPoolClientConnection,
} from './connection';

export type NodePostgresNativePool =
  ConnectionPool<NodePostgresPoolClientConnection>;

export type NodePostgresAmbientClientPool =
  ConnectionPool<NodePostgresClientConnection>;

export type NodePostgresAmbientConnectionPool = ConnectionPool<
  NodePostgresPoolClientConnection | NodePostgresClientConnection
>;

export type NodePostgresPool =
  | NodePostgresNativePool
  | NodePostgresAmbientClientPool
  | NodePostgresAmbientConnectionPool;

export const nodePostgresNativePool = (options: {
  connectionString: string;
  database?: string | undefined;
}): NodePostgresNativePool => {
  const { connectionString, database } = options;
  const pool = getPool({ connectionString, database });

  const getConnection = () =>
    nodePostgresConnection({
      type: 'PoolClient',
      connect: () => pool.connect(),
      close: (client) => Promise.resolve(client.release()),
    });

  const open = () => Promise.resolve(getConnection());
  const close = () => endPool({ connectionString, database });

  return createConnectionPool({
    connector: NodePostgresConnectorType,
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
    connector: NodePostgresConnectorType,
    getConnection: () =>
      nodePostgresConnection({
        type: 'PoolClient',
        connect: () => pool.connect(),
        close: (client) => Promise.resolve(client.release()),
      }),
  });
};

export const nodePostgresAmbientConnectionPool = (options: {
  connection: NodePostgresPoolClientConnection | NodePostgresClientConnection;
}): NodePostgresAmbientConnectionPool => {
  const { connection } = options;

  return createConnectionPool({
    connector: NodePostgresConnectorType,
    getConnection: () => connection,
    execute: connection.execute,
    transaction: () => connection.transaction(),
    withTransaction: (handle) => connection.withTransaction(handle),
  });
};

export const nodePostgresClientPool = (options: {
  connectionString: string;
  database?: string | undefined;
}): NodePostgresAmbientClientPool => {
  const { connectionString, database } = options;

  return createConnectionPool({
    connector: NodePostgresConnectorType,
    getConnection: () => {
      const connect = async () => {
        const client = new pg.Client({ connectionString, database });
        await client.connect();
        return client;
      };

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
}): NodePostgresAmbientClientPool => {
  const { client } = options;

  const getConnection = () => {
    const connect = () => Promise.resolve(client);

    return nodePostgresConnection({
      type: 'Client',
      connect,
      close: () => Promise.resolve(),
    });
  };

  const open = () => Promise.resolve(getConnection());
  const close = () => Promise.resolve();

  return createConnectionPool({
    connector: NodePostgresConnectorType,
    connection: open,
    close,
    getConnection,
  });
};

export type NodePostgresPoolPooledOptions =
  | {
      connector?: NodePostgresConnector;
      connectionString: string;
      database?: string;
      pooled: true;
      pool: pg.Pool;
    }
  | {
      connector?: NodePostgresConnector;
      connectionString: string;
      database?: string;
      pool: pg.Pool;
    }
  | {
      connector?: NodePostgresConnector;
      connectionString: string;
      database?: string;
      pooled: true;
    }
  | {
      connector?: NodePostgresConnector;
      connectionString: string;
      database?: string;
    };

export type NodePostgresPoolNotPooledOptions =
  | {
      connector?: NodePostgresConnector;
      connectionString: string;
      database?: string;
      pooled: false;
      client: pg.Client;
    }
  | {
      connector?: NodePostgresConnector;
      connectionString: string;
      database?: string;
      client: pg.Client;
    }
  | {
      connector?: NodePostgresConnector;
      connectionString: string;
      database?: string;
      pooled: false;
    }
  | {
      connector?: NodePostgresConnector;
      connectionString: string;
      database?: string;
      connection:
        | NodePostgresPoolClientConnection
        | NodePostgresClientConnection;
      pooled?: false;
    };

export type NodePostgresPoolOptions = (
  | NodePostgresPoolPooledOptions
  | NodePostgresPoolNotPooledOptions
) & {
  serializer?: JSONSerializer;
};

export function nodePostgresPool(
  options: NodePostgresPoolPooledOptions,
): NodePostgresNativePool;
export function nodePostgresPool(
  options: NodePostgresPoolNotPooledOptions,
): NodePostgresAmbientClientPool;
export function nodePostgresPool(
  options: NodePostgresPoolOptions,
):
  | NodePostgresNativePool
  | NodePostgresAmbientClientPool
  | NodePostgresAmbientConnectionPool {
  const { connectionString, database, serializer } = options;

  setNodePostgresTypeParser(serializer ?? JSONSerializer);

  if ('client' in options && options.client)
    return nodePostgresAmbientClientPool({ client: options.client });

  if ('connection' in options && options.connection)
    return nodePostgresAmbientConnectionPool({
      connection: options.connection,
    });

  if ('pooled' in options && options.pooled === false)
    return nodePostgresClientPool({ connectionString, database });

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
    tracer.error('connection-closing-error', { lookupKey, error });
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
