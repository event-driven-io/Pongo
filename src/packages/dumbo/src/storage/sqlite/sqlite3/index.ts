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
  SQLite3ConnectorType,
  sqlite3Client as sqliteClient,
  type SQLite3Connector,
} from './connections';

const sqlite3StoragePlugin: StoragePlugin<
  SQLite3Connector,
  SQLiteConnection<SQLite3Connector>
> = {
  connector: SQLite3ConnectorType,
  createPool: (options) =>
    sqlitePool(options as unknown as SQLitePoolOptions<SQLite3Connector>),
  sqlFormatter: sqliteFormatter,
  defaultMigratorOptions: DefaultSQLiteMigratorOptions,
};

storagePluginRegistry.register(SQLite3ConnectorType, sqlite3StoragePlugin);

export { sqliteClient, sqlite3StoragePlugin as storagePlugin };

export const connectionPool = sqlitePool;

export const dumbo = <
  DumboOptionsType extends
    SQLitePoolOptions<SQLite3Connector> = SQLitePoolOptions<SQLite3Connector>,
>(
  options: DumboOptionsType,
): Dumbo<SQLite3Connector, SQLiteConnection<SQLite3Connector>> =>
  sqlitePool(options);
