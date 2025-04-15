import {
  SQL,
  type PostgreSQLConnector,
  type QueryResult,
  type QueryResultRow,
  type SQLCommandOptions,
  type SQLExecutor,
  type SQLQueryOptions,
} from '../pg';
import { SQLite3Connector, type SQLiteConnection } from '../sqlite3';
import type { Connection, ConnectionPool } from './connections';
import type { ConnectorType } from './connectors';

export * from './connections';
export * from './connectors';
export * from './execute';
export * from './locks';
export * from './query';
export * from './schema';
export * from './serializer';
export * from './sql';
export * from './tracing';

export type DumboOptions<Connector extends ConnectorType = ConnectorType> = {
  connector: Connector;
  connectionString: string;
};

export type Dumbo<
  Connector extends ConnectorType = ConnectorType,
  ConnectionType extends Connection<Connector> = Connection<Connector>,
> = ConnectionPool<ConnectionType>;

export type PostgreSQLConnectionString = `postgresql://${string}`;

export type SQLiteConnectionString =
  | `file:${string}`
  | `:memory:`
  | `/${string}`
  | `./${string}`;

// Helper type to infer the connector type based on connection string
export type InferConnector<T extends DatabaseConnectionString> =
  T extends PostgreSQLConnectionString
    ? PostgreSQLConnector
    : T extends SQLiteConnectionString
      ? SQLite3Connector
      : never;

// Helper type to infer the connection type based on connection string
export type InferConnection<T extends DatabaseConnectionString> =
  T extends PostgreSQLConnectionString
    ? PostgreSQLConnection<ConnectorType<'PostgreSQL', 'pg'>>
    : T extends SQLiteConnectionString
      ? SQLiteConnection<ConnectorType<'SQLite', 'sqlite3'>>
      : never;

export type DatabaseConnectionString =
  | PostgreSQLConnectionString
  | SQLiteConnectionString;

export type DumboConnectionOptions<
  T extends DatabaseConnectionString = DatabaseConnectionString,
> = {
  connectionString: T;
};

export const createLazyExecutor = (
  importExecutor: () => Promise<SQLExecutor>,
): SQLExecutor => {
  let executor: SQLExecutor | null = null;

  const getExecutor = async (): Promise<SQLExecutor> => {
    if (!executor) {
      try {
        executor = await importExecutor();
      } catch (error) {
        throw new Error(
          `Failed to import SQL executor: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return executor;
  };

  return {
    query: async <Result extends QueryResultRow = QueryResultRow>(
      sql: SQL,
      options?: SQLQueryOptions,
    ): Promise<QueryResult<Result>> => {
      const exec = await getExecutor();
      return exec.query<Result>(sql, options);
    },

    batchQuery: async <Result extends QueryResultRow = QueryResultRow>(
      sqls: SQL[],
      options?: SQLQueryOptions,
    ): Promise<QueryResult<Result>[]> => {
      const exec = await getExecutor();
      return exec.batchQuery<Result>(sqls, options);
    },

    command: async <Result extends QueryResultRow = QueryResultRow>(
      sql: SQL,
      options?: SQLCommandOptions,
    ): Promise<QueryResult<Result>> => {
      const exec = await getExecutor();
      return exec.command<Result>(sql, options);
    },

    batchCommand: async <Result extends QueryResultRow = QueryResultRow>(
      sqls: SQL[],
      options?: SQLCommandOptions,
    ): Promise<QueryResult<Result>[]> => {
      const exec = await getExecutor();
      return exec.batchCommand<Result>(sqls, options);
    },
  };
};

export const createDeferredConnection = <C extends ConnectorType>(
  connector: C,
  importConnection: () => Promise<Connection<C>>,
): Connection<C> => {
  let connectionPromise: Promise<Connection<C>> | null = null;

  const getConnection = async (): Promise<Connection<C>> => {
    if (!connectionPromise) {
      try {
        connectionPromise = importConnection();
      } catch (error) {
        throw new Error(
          `Failed to import connection: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return connectionPromise;
  };

  const execute = createLazyExecutor(async () => {
    const conn = await getConnection();
    return conn.execute;
  });

  return {
    connector,
    execute,

    open: async (): Promise<unknown> => {
      const conn = await getConnection();
      return conn.open();
    },

    close: async (): Promise<void> => {
      if (connectionPromise) {
        const conn = await connectionPromise;
        await conn.close();
      }
    },

    transaction: async <T>(
      fn: (transaction: any) => Promise<T>,
    ): Promise<T> => {
      const conn = await getConnection();
      return conn.transaction(fn);
    },

    withTransaction: async <T>(
      fn: (transaction: any) => Promise<T>,
    ): Promise<T> => {
      const conn = await getConnection();
      return conn.withTransaction(fn);
    },
  };
};

export const createDeferredConnectionPool = <C extends ConnectorType>(
  connector: C,
  importPool: () => Promise<ConnectionPool<Connection<C>>>,
): ConnectionPool<Connection<C>> => {
  let poolPromise: Promise<ConnectionPool<Connection<C>>> | null = null;

  const getPool = async (): Promise<ConnectionPool<Connection<C>>> => {
    if (!poolPromise) {
      try {
        poolPromise = importPool();
      } catch (error) {
        throw new Error(
          `Failed to import connection pool: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return poolPromise;
  };

  const execute = createLazyExecutor(async () => {
    const pool = await getPool();
    return pool.execute;
  });

  return {
    connector,
    execute,

    connection: async (): Promise<Connection<C>> => {
      const pool = await getPool();
      return pool.connection();
    },

    withConnection: async <T>(
      fn: (connection: Connection<C>) => Promise<T>,
    ): Promise<T> => {
      const pool = await getPool();
      return pool.withConnection(fn);
    },

    close: async (): Promise<void> => {
      if (poolPromise) {
        const pool = await poolPromise;
        await pool.close();
      }
    },

    transaction: async <T>(
      fn: (transaction: any) => Promise<T>,
    ): Promise<T> => {
      const pool = await getPool();
      return pool.transaction(fn);
    },

    withTransaction: async <T>(
      fn: (transaction: any) => Promise<T>,
    ): Promise<T> => {
      const pool = await getPool();
      return pool.withTransaction(fn);
    },
  };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const importDrivers: Record<string, () => Promise<any>> = {
  'postgresql:pg': () => import('../storage/postgresql/pg'),
  'sqlite:sqlite3': () => import('../storage/sqlite/sqlite3'),
};

export type DbDriverInfo = {
  dbType: string;
  driverName: string;
};

export const parseConnectionString = (
  connectionString: DatabaseConnectionString,
): DbDriverInfo => {
  if (connectionString.startsWith('postgresql://')) {
    return {
      dbType: 'postgresql',
      driverName: 'pg',
    };
  }

  if (
    connectionString.startsWith('file:') ||
    connectionString === ':memory:' ||
    connectionString.startsWith('/') ||
    connectionString.startsWith('./')
  ) {
    return {
      dbType: 'sqlite',
      driverName: 'sqlite3',
    };
  }

  throw new Error(
    `Unsupported database connection string: ${connectionString}`,
  );
};

export function dumbo<T extends DatabaseConnectionString>(
  options: DumboConnectionOptions<T>,
): ConnectionPool<InferConnection<T>> {
  const { connectionString } = options;

  const { dbType, driverName } = parseConnectionString(connectionString);

  const connector: InferConnection<T>['connector'] = `${dbType}:${driverName}`;

  const importDriver = importDrivers[connector];
  if (!importDriver) {
    throw new Error(`Unsupported connector: ${connector}`);
  }

  const importAndCreatePool = async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const module = await importDriver();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const poolFactory: (options: {
      connectionString: string;
    }) => ConnectionPool<InferConnection<T>> =
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      'dumbo' in module ? module.dumbo : undefined;

    if (poolFactory === undefined)
      throw new Error(`No pool factory found for connector: ${connector}`);

    return poolFactory({ connectionString });
  };

  return createDeferredConnectionPool(
    connector,
    importAndCreatePool,
  ) as ConnectionPool<InferConnection<T>>;
}
