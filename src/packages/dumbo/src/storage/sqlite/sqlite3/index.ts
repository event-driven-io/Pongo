export * from './connections';
import type { Dumbo, DumboDatabaseDriver } from '../../../core';
import { storagePluginRegistry } from '../../../core/plugins/storagePlugin';
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

const sqlite3StoragePlugin: DumboDatabaseDriver<
  SQLiteConnection<SQLite3DriverType>,
  SQLitePoolOptions<SQLite3DriverType>,
  SQLiteConnectionString
> = {
  driverType: SQLite3DriverType,
  createPool: (options) =>
    sqlitePool(options as unknown as SQLitePoolOptions<SQLite3DriverType>),
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

storagePluginRegistry.register(SQLite3DriverType, sqlite3StoragePlugin);

export { sqliteClient, sqlite3StoragePlugin as storagePlugin };

export const connectionPool = sqlitePool;

export const dumbo = <
  DumboOptionsType extends
    SQLitePoolOptions<SQLite3DriverType> = SQLitePoolOptions<SQLite3DriverType>,
>(
  options: DumboOptionsType,
): Dumbo<SQLite3DriverType, SQLiteConnection<SQLite3DriverType>> =>
  sqlitePool(options);
