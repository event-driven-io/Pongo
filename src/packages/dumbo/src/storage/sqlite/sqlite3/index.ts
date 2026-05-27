export * from './connections';
import {
  canHandleDriverWithConnectionString,
  dumboDatabaseDriverRegistry,
  JSONSerializer,
  type DumboConnectionOptions,
  type DumboDatabaseDriver,
} from '../../../core';
import {
  DefaultSQLiteMigratorOptions,
  isInMemoryDatabase,
  SQLiteConnectionString,
  sqliteFormatter,
  sqliteMetadata,
  sqlitePool,
  toSqlitePoolOptions,
  type SQLitePool,
  type SQLitePoolOptions,
} from '../core';
import {
  sqlite3Connection,
  SQLite3DriverType,
  type SQLite3Connection,
  type SQLite3ConnectionOptions,
} from './connections';
import { sqliteDualConnectionPool } from './pool/dualPool';
import { sqlite3SingletonPool } from './pool/singletonPool';

export type SQLite3DumboOptions = Omit<
  SQLitePoolOptions<SQLite3Connection, SQLite3ConnectionOptions>,
  'driverType'
> &
  SQLite3ConnectionOptions & { serializer?: JSONSerializer };

export type SQLite3PoolOptions = SQLite3DumboOptions;

export type Sqlite3Pool = SQLitePool<SQLite3Connection>;

export const sqlite3Pool = (
  options: SQLite3DumboOptions,
): SQLitePool<SQLite3Connection> => {
  // Ambient: caller-managed connection. No acquisition, no serialisation.
  if ('connection' in options && options.connection) {
    return sqlitePool(
      toSqlitePoolOptions({
        ...options,
        driverType: SQLite3DriverType,
      }),
    );
  }

  const sqliteConnectionFactory = (opts: SQLite3ConnectionOptions) =>
    sqlite3Connection({
      ...opts,
      serializer: options.serializer ?? JSONSerializer,
    });

  // Singleton-shaped: in-memory DBs, an explicit client, or `singleton: true`.
  // One connection shared across callers — wrap it so concurrent callers
  // serialise through a single-slot TaskProcessor with ALS-based reentrancy.
  const isSingleton =
    isInMemoryDatabase(options) ||
    ('client' in options && Boolean(options.client)) ||
    options.singleton === true;

  if (isSingleton) {
    return sqlite3SingletonPool<SQLite3Connection>({
      driverType: SQLite3DriverType,
      getConnection: () => sqliteConnectionFactory(options),
    });
  }

  // Default: file-backed dual pool. Its writer side is serialised inside
  // sqliteDualConnectionPool via the same primitive.
  const readerPoolSize = (options as { readerPoolSize?: number })
    .readerPoolSize;
  return sqliteDualConnectionPool({
    driverType: SQLite3DriverType,
    sqliteConnectionFactory,
    connectionOptions: options,
    ...(readerPoolSize !== undefined ? { readerPoolSize } : {}),
  });
};

const tryParseConnectionString = (connectionString: string) => {
  try {
    return SQLiteConnectionString(connectionString);
  } catch {
    return null;
  }
};

export const sqlite3DumboDriver = {
  driverType: SQLite3DriverType,
  createPool: (options) => sqlite3Pool(options as SQLite3DumboOptions),
  sqlFormatter: sqliteFormatter,
  defaultMigratorOptions: DefaultSQLiteMigratorOptions,
  canHandle: canHandleDriverWithConnectionString(
    SQLite3DriverType,
    tryParseConnectionString,
  ),
  databaseMetadata: sqliteMetadata,
} satisfies DumboDatabaseDriver<
  SQLite3Connection,
  SQLite3DumboOptions,
  Sqlite3Pool
>;

export const useSqlite3DumboDriver = () => {
  dumboDatabaseDriverRegistry.register(SQLite3DriverType, sqlite3DumboDriver);
};

export type SQLite3DumboConnectionOptions = DumboConnectionOptions<
  typeof sqlite3DumboDriver
> & { connectionString: string | SQLiteConnectionString };

useSqlite3DumboDriver();

export * from './connections';
export * from './formatter';
export * from './transactions';
