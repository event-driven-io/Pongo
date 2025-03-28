import {
  SQL,
  type QueryResult,
  type QueryResultRow,
  type SQLCommandOptions,
  type SQLExecutor,
  type SQLQueryOptions,
} from '../core';
import {
  createConnectionPool,
  type Connection,
  type ConnectionPool,
} from './connections';
import type { ConnectorType, ConnectorTypeParts } from './connectors';

export * from './connections';
export * from './connectors';
export * from './execute';
export * from './locks';
export * from './query';
export * from './schema';
export * from './serializer';
export * from './sql';
export * from './tracing';

export type Dumbo<
  Connector extends ConnectorType = ConnectorType,
  ConnectionType extends Connection<Connector> = Connection<Connector>,
> = ConnectionPool<ConnectionType>;

export type PostgreSQLConnectionString =
  | `postgresql://${string}`
  | `postgres://${string}`;

export const postgreSQLConnectionString = (
  connectionString: string,
): PostgreSQLConnectionString => {
  if (
    !connectionString.startsWith('postgresql://') &&
    !connectionString.startsWith('postgres://')
  ) {
    throw new Error(
      `Invalid PostgreSQL connection string: ${connectionString}. It should start with "postgresql://".`,
    );
  }
  return connectionString as PostgreSQLConnectionString;
};

export type SQLiteConnectionString =
  | `file:${string}`
  | `:memory:`
  | `/${string}`
  | `./${string}`;

// Helper type to infer the connector type based on connection string
export type InferConnector<T extends DatabaseConnectionString> =
  T extends PostgreSQLConnectionString
    ? ConnectorType<'PostgreSQL', 'pg'>
    : T extends SQLiteConnectionString
      ? ConnectorType<'SQLite', 'sqlite3'>
      : never;

// Helper type to infer the connection type based on connection string
export type InferConnection<T extends DatabaseConnectionString> =
  T extends PostgreSQLConnectionString
    ? Connection<ConnectorType<'PostgreSQL', 'pg'>>
    : T extends SQLiteConnectionString
      ? Connection<ConnectorType<'SQLite', 'sqlite3'>>
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

export const createDeferredConnection = <Connector extends ConnectorType>(
  connector: Connector,
  importConnection: () => Promise<Connection<Connector>>,
): Connection<Connector> => {
  const getConnection = importConnection();

  const execute = createLazyExecutor(async () => {
    const conn = await getConnection;
    return conn.execute;
  });

  const connection: Connection<Connector> = {
    connector,
    execute,

    open: async (): Promise<unknown> => {
      const conn = await getConnection;
      return conn.open();
    },

    close: async (): Promise<void> => {
      if (getConnection) {
        const conn = await getConnection;
        await conn.close();
      }
    },

    transaction: () => {
      const transaction = getConnection.then((c) => c.transaction());

      return {
        connector,
        connection,
        execute: createLazyExecutor(async () => (await transaction).execute),
        begin: async () => (await transaction).begin(),
        commit: async () => (await transaction).commit(),
        rollback: async () => (await transaction).rollback(),
      };
    },
    withTransaction: async (handle) => {
      const connection = await getConnection;
      return connection.withTransaction(handle);
    },
  };

  return connection;
};

export const createDeferredConnectionPool = <Connector extends ConnectorType>(
  connector: Connector,
  importPool: () => Promise<ConnectionPool<Connection<Connector>>>,
): ConnectionPool<Connection<Connector>> => {
  let poolPromise: Promise<ConnectionPool<Connection<Connector>>> | null = null;

  const getPool = async (): Promise<ConnectionPool<Connection<Connector>>> => {
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

  return createConnectionPool({
    connector,
    close: async () => {
      if (!poolPromise) return;
      const pool = await poolPromise;
      await pool.close();
      poolPromise = null;
    },
    getConnection: () =>
      createDeferredConnection(connector, async () =>
        (await getPool()).connection(),
      ),
  });
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const importDrivers: Record<string, () => Promise<any>> = {
  'postgresql:pg': () => import('../storage/postgresql/pg'),
  'sqlite:sqlite3': () => import('../storage/sqlite/sqlite3'),
};

export const parseConnectionString = (
  connectionString: DatabaseConnectionString,
): ConnectorTypeParts => {
  if (
    connectionString.startsWith('postgresql://') ||
    connectionString.startsWith('postgres://')
  ) {
    return {
      databaseType: 'postgresql',
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
      databaseType: 'sqlite',
      driverName: 'sqlite3',
    };
  }

  throw new Error(
    `Unsupported database connection string: ${connectionString}`,
  );
};

export function dumbo<
  ConnectionString extends DatabaseConnectionString,
  DatabaseOptions extends DumboConnectionOptions<ConnectionString>,
>(options: DatabaseOptions): ConnectionPool<InferConnection<ConnectionString>> {
  const { connectionString } = options;

  const { databaseType, driverName } = parseConnectionString(connectionString);

  const connector: InferConnection<ConnectionString>['connector'] =
    `${databaseType}:${driverName}` as InferConnection<ConnectionString>['connector'];

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
    }) => ConnectionPool<InferConnection<ConnectionString>> =
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      'dumbo' in module ? module.dumbo : undefined;

    if (poolFactory === undefined)
      throw new Error(`No pool factory found for connector: ${connector}`);

    return poolFactory({ connectionString });
  };

  return createDeferredConnectionPool(
    connector,
    importAndCreatePool,
  ) as ConnectionPool<InferConnection<ConnectionString>>;
}
