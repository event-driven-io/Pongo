import type { DumboDatabaseDriver } from '../../../core';
import { storagePluginRegistry } from '../../../core/plugins/storagePlugin';
import {
  defaultPostgreSQLConnectionString,
  DefaultPostgreSQLMigratorOptions,
  getDatabaseNameOrDefault,
  pgFormatter,
  PostgreSQLConnectionString,
} from '../core';
import {
  type NodePostgresConnection,
  NodePostgresDriverType,
  type NodePostgresPool,
  nodePostgresPool,
  type NodePostgresPoolOptions,
} from './connections';

export const pgDatabaseDriver: DumboDatabaseDriver<
  NodePostgresConnection,
  NodePostgresPoolOptions,
  PostgreSQLConnectionString
> = {
  driverType: NodePostgresDriverType,
  createPool: (options) => nodePostgresPool(options),
  sqlFormatter: pgFormatter,
  defaultMigratorOptions: DefaultPostgreSQLMigratorOptions,
  defaultConnectionString: defaultPostgreSQLConnectionString,
  getDatabaseNameOrDefault,
  tryParseConnectionString: (connectionString) => {
    try {
      return PostgreSQLConnectionString(connectionString);
    } catch {
      return null;
    }
  },
};

storagePluginRegistry.register(NodePostgresDriverType, pgDatabaseDriver);

export * from './connections';
export * from './execute';
export * from './serialization';

export { pgDatabaseDriver as databaseDriver };

// TODO: Remove stuff below

export type PostgresDriverType = NodePostgresDriverType;
export type PostgresPool = NodePostgresPool;
export type PostgresConnection = NodePostgresConnection;

export type PostgresPoolOptions = NodePostgresPoolOptions;
export const postgresPool = nodePostgresPool;

export const connectionPool = postgresPool;
