import type { Dumbo, DumboDatabaseDriver } from '../../../core';
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

export const pgStoragePlugin: DumboDatabaseDriver<
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

storagePluginRegistry.register(NodePostgresDriverType, pgStoragePlugin);

export const dumbo = <
  DumboOptionsType extends PostgresPoolOptions = PostgresPoolOptions,
>(
  options: DumboOptionsType,
): Dumbo<NodePostgresDriverType> => nodePostgresPool(options);

export * from './connections';
export * from './execute';
export * from './serialization';

export { pgStoragePlugin as storagePlugin };

// TODO: Remove stuff below

export type PostgresDriverType = NodePostgresDriverType;
export type PostgresPool = NodePostgresPool;
export type PostgresConnection = NodePostgresConnection;

export type PostgresPoolOptions = NodePostgresPoolOptions;
export const postgresPool = nodePostgresPool;

export const connectionPool = postgresPool;
