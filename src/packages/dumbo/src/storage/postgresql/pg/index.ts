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
  type PgConnection,
  PgDriverType,
  pgPool,
  type PgPool,
  type PgPoolOptions,
} from './connections';

const tryParseConnectionString = (connectionString: string) => {
  try {
    return PostgreSQLConnectionString(connectionString);
  } catch {
    return null;
  }
};

export const pgDatabaseDriver: DumboDatabaseDriver<
  PgConnection,
  PgPoolOptions
> = {
  driverType: PgDriverType,
  createPool: (options) => pgPool(options as PgPoolOptions),
  sqlFormatter: pgFormatter,
  defaultMigratorOptions: DefaultPostgreSQLMigratorOptions,
  getDatabaseNameOrDefault,
  canHandle: canHandleDriverWithConnectionString(
    PgDriverType,
    tryParseConnectionString,
  ),
};

export const usePgDatabaseDriver = () => {
  dumboDatabaseDriverRegistry.register(PgDriverType, pgDatabaseDriver);
};

usePgDatabaseDriver();

export * from './connections';
export * from './execute';
export * from './serialization';

export { pgDatabaseDriver as databaseDriver };

export type PostgreSQLPool = PgPool;
export type PostgreSQLConnection = PgConnection;

export type PostgreSQLPoolOptions = PgPoolOptions;
export const postgresPool = pgPool;

export const connectionPool = postgresPool;
