import {
  canHandleDriverWithConnectionString,
  type DumboDatabaseDriver,
  dumboDatabaseDriverRegistry,
} from '../../../core';
import {
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

const tryParseConnectionString = (connectionString: string) => {
  try {
    return PostgreSQLConnectionString(connectionString);
  } catch {
    return null;
  }
};

export const pgDatabaseDriver: DumboDatabaseDriver<
  NodePostgresConnection,
  NodePostgresPoolOptions
> = {
  driverType: NodePostgresDriverType,
  createPool: (options) => nodePostgresPool(options as NodePostgresPoolOptions),
  sqlFormatter: pgFormatter,
  defaultMigratorOptions: DefaultPostgreSQLMigratorOptions,
  getDatabaseNameOrDefault,
  canHandle: canHandleDriverWithConnectionString(
    NodePostgresDriverType,
    tryParseConnectionString,
  ),
};

export const usePgDatabaseDriver = () => {
  dumboDatabaseDriverRegistry.register(
    NodePostgresDriverType,
    pgDatabaseDriver,
  );
};

usePgDatabaseDriver();

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
