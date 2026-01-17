export * from './connections';
import {
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
  type SQLiteClient,
  type SQLiteClientFactoryOptions,
  type SQLiteConnection,
  type SQLiteDumboConnectionOptions,
  type SQLiteFileNameOrConnectionString,
} from '../core';
import {
  sqlite3Client,
  SQLite3DriverType,
  type SQLite3ClientOptions,
} from './connections';

export const sqlite3Pool = (
  options: SQLiteDumboConnectionOptions<SQLiteConnection<SQLite3DriverType>> &
    SQLiteFileNameOrConnectionString,
) =>
  sqlitePool({
    ...options,
    sqliteClient: sqlite3Client,
  } as SQLiteDumboConnectionOptions<SQLiteConnection<SQLite3DriverType>> &
    SQLiteClientFactoryOptions<SQLiteClient, SQLite3ClientOptions>);

export const sqlite3DatabaseDriver = {
  driverType: 'SQLite:sqlite3' as const,
  createPool: (options) =>
    sqlite3Pool(
      options as SQLiteDumboConnectionOptions<
        SQLiteConnection<SQLite3DriverType>
      > &
        SQLiteFileNameOrConnectionString,
    ),
  sqlFormatter: sqliteFormatter,
  defaultMigratorOptions: DefaultSQLiteMigratorOptions,
  getDatabaseNameOrDefault: () => InMemorySQLiteDatabase,
  defaultConnectionString: InMemorySQLiteDatabase,
  tryParseConnectionString: (connectionString) => {
    try {
      return SQLiteConnectionString(connectionString);
    } catch {
      return null;
    }
  },
} satisfies DumboDatabaseDriver<
  SQLiteConnection<SQLite3DriverType>,
  SQLiteDumboConnectionOptions<SQLiteConnection<SQLite3DriverType>>,
  SQLiteConnectionString
>;

export const useSqlite3DatabaseDriver = () => {
  dumboDatabaseDriverRegistry.register(
    SQLite3DriverType,
    sqlite3DatabaseDriver,
  );
};

export type SQLite3DumboConnectionOptions = DumboConnectionOptions<
  typeof sqlite3DatabaseDriver
>;

useSqlite3DatabaseDriver();

export {
  sqlite3DatabaseDriver as databaseDriver,
  sqlite3Client as sqliteClient,
};

export const connectionPool = sqlitePool;
