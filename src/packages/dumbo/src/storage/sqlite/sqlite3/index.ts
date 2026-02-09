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

export type SQLite3DumboOptions = Omit<
  SQLitePoolOptions<SQLite3Connection, SQLite3ConnectionOptions>,
  'driverType'
> &
  SQLite3ConnectionOptions & { serializer?: JSONSerializer };

export type SQLite3PoolOptions = SQLite3DumboOptions;

export type Sqlite3Pool = SQLitePool<SQLite3Connection>;

export const sqlite3Pool = (options: SQLite3DumboOptions) =>
  sqlitePool(
    toSqlitePoolOptions({
      ...options,
      driverType: SQLite3DriverType,
      ...('connection' in options
        ? {}
        : {
            connectionOptions: options as SQLite3ConnectionOptions,
            sqliteConnectionFactory: (opts: SQLite3ConnectionOptions) =>
              sqlite3Connection({
                ...opts,
                serializer: options.serializer ?? JSONSerializer,
              }),
          }),
    }),
  );

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
