export * from './connections';
import {
  dumboDatabaseDriverRegistry,
  type DumboDatabaseDriver,
} from '../../../core';
import {
  DefaultSQLiteMigratorOptions,
  InMemorySQLiteDatabase,
  SQLiteConnectionString,
  sqliteFormatter,
  sqlitePool,
  type SQLiteConnection,
  type SQLitePoolOptions,
} from '../core';
import {
  SQLite3DriverType,
  sqlite3Client as sqliteClient,
} from './connections';

export const sqlite3DatabaseDriver: DumboDatabaseDriver<
  SQLiteConnection<SQLite3DriverType>,
  SQLitePoolOptions<SQLite3DriverType>,
  SQLiteConnectionString
> = {
  driverType: SQLite3DriverType,
  createPool: (options) =>
    sqlitePool(options as SQLitePoolOptions<SQLite3DriverType>),
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
};

export const useSqlite3DatabaseDriver = () => {
  dumboDatabaseDriverRegistry.register(
    SQLite3DriverType,
    sqlite3DatabaseDriver,
  );
};

useSqlite3DatabaseDriver();

export { sqlite3DatabaseDriver as databaseDriver, sqliteClient };

export const connectionPool = sqlitePool;
