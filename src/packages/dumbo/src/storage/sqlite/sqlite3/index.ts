export * from './connections';
import type { Dumbo } from '../../../core';
import {
  storagePluginRegistry,
  type StoragePlugin,
} from '../../../core/plugins/storagePlugin';
import {
  DefaultSQLiteMigratorOptions,
  sqliteFormatter,
  sqlitePool,
  type SQLiteConnection,
  type SQLitePoolOptions,
} from '../core';
import {
  SQLite3DriverType,
  sqlite3Client as sqliteClient,
} from './connections';

const sqlite3StoragePlugin: StoragePlugin<
  SQLite3DriverType,
  SQLiteConnection<SQLite3DriverType>
> = {
  driverType: SQLite3DriverType,
  createPool: (options) =>
    sqlitePool(options as unknown as SQLitePoolOptions<SQLite3DriverType>),
  sqlFormatter: sqliteFormatter,
  defaultMigratorOptions: DefaultSQLiteMigratorOptions,
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
