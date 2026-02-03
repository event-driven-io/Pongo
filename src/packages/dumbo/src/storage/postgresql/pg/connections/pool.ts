import pg from 'pg';
import {
  createAmbientConnectionPool,
  createConnectionPool,
  JSONSerializer,
  tracer,
  type ConnectionPool,
  type JSONSerializationOptions,
} from '../../../../core';
import {
  defaultPostgreSqlDatabase,
  getDatabaseNameOrDefault,
} from '../../core';
import { setPgTypeParser } from '../serialization';
import {
  pgConnection,
  PgDriverType,
  type PgClientConnection,
  type PgPoolClientConnection,
} from './connection';

export type PgNativePool = ConnectionPool<PgPoolClientConnection>;

export type PgAmbientClientPool = ConnectionPool<PgClientConnection>;

export type PgAmbientConnectionPool = ConnectionPool<
  PgPoolClientConnection | PgClientConnection
>;

export type PgPool =
  | PgNativePool
  | PgAmbientClientPool
  | PgAmbientConnectionPool;

export const pgNativePool = (options: {
  connectionString: string;
  database?: string | undefined;
  serializer: JSONSerializer;
}): PgNativePool => {
  const { connectionString, database } = options;
  const pool = getPool({ connectionString, database });

  const getConnection = () =>
    pgConnection({
      type: 'PoolClient',
      connect: async () => {
        const client = await pool.connect();

        setPgTypeParser(client, {
          parseBigInts: true,
          serializer: options.serializer,
        });

        return client;
      },
      close: (client) => Promise.resolve(client.release()),
      serializer: options.serializer,
    });

  const open = () => Promise.resolve(getConnection());
  const close = () => endPool({ connectionString, database });

  return createConnectionPool({
    driverType: PgDriverType,
    connection: open,
    close,
    getConnection,
  });
};

export const pgAmbientNativePool = (options: {
  pool: pg.Pool;
  serializer: JSONSerializer;
}): PgNativePool => {
  const { pool } = options;

  return createConnectionPool({
    driverType: PgDriverType,
    getConnection: () =>
      pgConnection({
        type: 'PoolClient',
        connect: () => pool.connect(),
        close: (client) => Promise.resolve(client.release()),
        serializer: options.serializer,
      }),
  });
};

export const pgAmbientConnectionPool = (options: {
  connection: PgPoolClientConnection | PgClientConnection;
}): PgAmbientConnectionPool => {
  const { connection } = options;

  return createAmbientConnectionPool({
    driverType: PgDriverType,
    connection,
  });
};

export const pgClientPool = (options: {
  connectionString: string;
  database?: string | undefined;
  serializer: JSONSerializer;
}): PgAmbientClientPool => {
  const { connectionString, database } = options;

  return createConnectionPool({
    driverType: PgDriverType,
    getConnection: () => {
      const connect = async () => {
        const client = new pg.Client({ connectionString, database });

        setPgTypeParser(client, {
          parseBigInts: true,
          serializer: options.serializer,
        });

        await client.connect();
        return client;
      };

      return pgConnection({
        type: 'Client',
        connect,
        close: (client) => client.end(),
        serializer: options.serializer,
      });
    },
  });
};

export const pgAmbientClientPool = (options: {
  client: pg.Client;
  serializer: JSONSerializer;
}): PgAmbientClientPool => {
  const { client } = options;

  const getConnection = () => {
    const connect = () => Promise.resolve(client);

    return pgConnection({
      type: 'Client',
      connect,
      close: () => Promise.resolve(),
      serializer: options.serializer,
    });
  };

  const open = () => Promise.resolve(getConnection());
  const close = () => Promise.resolve();

  return createConnectionPool({
    driverType: PgDriverType,
    connection: open,
    close,
    getConnection,
  });
};

export type PgPoolPooledOptions =
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

export type PgPoolNotPooledOptions =
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
      connection: PgPoolClientConnection | PgClientConnection;
      pooled?: false;
    };

export type PgPoolOptions = (PgPoolPooledOptions | PgPoolNotPooledOptions) &
  JSONSerializationOptions;

export function pgPool(options: PgPoolPooledOptions): PgNativePool;
export function pgPool(options: PgPoolNotPooledOptions): PgAmbientClientPool;
export function pgPool(
  options: PgPoolOptions,
): PgNativePool | PgAmbientClientPool | PgAmbientConnectionPool {
  const { connectionString, database } = options;

  const serializer = options.serialization?.serializer ?? JSONSerializer;

  if ('client' in options && options.client)
    return pgAmbientClientPool({ client: options.client, serializer });

  if ('connection' in options && options.connection)
    return pgAmbientConnectionPool({
      connection: options.connection,
    });

  if ('pooled' in options && options.pooled === false)
    return pgClientPool({ connectionString, database, serializer });

  if ('pool' in options && options.pool)
    return pgAmbientNativePool({ pool: options.pool, serializer });

  return pgNativePool({
    connectionString,
    database,
    serializer,
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
