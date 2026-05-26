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
import { serializeSqlite3WriterPool } from './serializeWriter';

export type SQLite3DumboOptions = Omit<
  SQLitePoolOptions<SQLite3Connection, SQLite3ConnectionOptions>,
  'driverType'
> &
  SQLite3ConnectionOptions & { serializer?: JSONSerializer };

export type SQLite3PoolOptions = SQLite3DumboOptions;

export type Sqlite3Pool = SQLitePool<SQLite3Connection>;

export const sqlite3Pool = (options: SQLite3DumboOptions) => {
  const pool = sqlitePool(
    toSqlitePoolOptions({
      ...options,
      driverType: SQLite3DriverType,
      ...('connection' in options
        ? {}
        : {
            connectionOptions: options,
            sqliteConnectionFactory: (opts: SQLite3ConnectionOptions) =>
              sqlite3Connection({
                ...opts,
                serializer: options.serializer ?? JSONSerializer,
              }),
          }),
    }),
  );

  // Ambient pools wrap a connection the caller already holds; serialising on
  // top of them would double-lock and defeat the purpose. Anything else gets
  // wrapped so writer-bound calls (withConnection, withTransaction, command,
  // batchCommand) serialise through a single TaskProcessor, with ALS-based
  // reentrancy so nested calls from inside an active writer task bypass the
  // queue instead of deadlocking.
  if ('connection' in options && options.connection) return pool;

  return serializeSqlite3WriterPool(pool);
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
