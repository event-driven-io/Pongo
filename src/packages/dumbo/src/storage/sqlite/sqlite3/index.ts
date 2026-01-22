export * from './connections';
import {
  canHandleDriverWithConnectionString,
  dumboDatabaseDriverRegistry,
  type DumboConnectionOptions,
  type DumboDatabaseDriver,
} from '../../../core';
import {
  DefaultSQLiteMigratorOptions,
  InMemorySQLiteDatabase,
  SQLiteConnectionString,
  sqliteFormatter,
  sqlitePool,
  toSqlitePoolOptions,
  type SQLitePoolOptions,
} from '../core';
import {
  sqlite3Client,
  sqlite3Connection,
  SQLite3DriverType,
  type SQLite3Connection,
  type SQLite3ConnectionOptions,
} from './connections';

export type SQLite3DumboOptions = Omit<
  SQLitePoolOptions<SQLite3Connection, SQLite3ConnectionOptions>,
  'driverType'
> &
  SQLite3ConnectionOptions;

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
              sqlite3Connection(opts),
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

export const sqlite3DatabaseDriver = {
  driverType: SQLite3DriverType,
  createPool: (options) => sqlite3Pool(options as SQLite3DumboOptions),
  sqlFormatter: sqliteFormatter,
  defaultMigratorOptions: DefaultSQLiteMigratorOptions,
  getDatabaseNameOrDefault: () => InMemorySQLiteDatabase,
  canHandle: canHandleDriverWithConnectionString(
    SQLite3DriverType,
    tryParseConnectionString,
  ),
} satisfies DumboDatabaseDriver<SQLite3Connection, SQLite3DumboOptions>;

export const useSqlite3DatabaseDriver = () => {
  dumboDatabaseDriverRegistry.register(
    SQLite3DriverType,
    sqlite3DatabaseDriver,
  );
};

export type SQLite3DumboConnectionOptions = DumboConnectionOptions<
  typeof sqlite3DatabaseDriver
> & { connectionString: string | SQLiteConnectionString };

useSqlite3DatabaseDriver();

export {
  sqlite3Pool as connectionPool,
  sqlite3DatabaseDriver as databaseDriver,
  sqlite3Client as sqliteClient,
};

export * from './connections';
export * from './formatter';
export * from './transactions';
