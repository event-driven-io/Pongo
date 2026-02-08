import {
  canHandleDriverWithConnectionString,
  type DumboDatabaseDriver,
  dumboDatabaseDriverRegistry,
} from '../../../core';
import {
  DefaultPostgreSQLMigratorOptions,
  pgFormatter,
  postgreSQLMetadata,
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

export const pgDumboDriver: DumboDatabaseDriver<
  PgConnection,
  PgPoolOptions,
  PgPool
> = {
  driverType: PgDriverType,
  createPool: (options) => pgPool(options as PgPoolOptions),
  sqlFormatter: pgFormatter,
  defaultMigratorOptions: DefaultPostgreSQLMigratorOptions,
  canHandle: canHandleDriverWithConnectionString(
    PgDriverType,
    tryParseConnectionString,
  ),
  databaseMetadata: postgreSQLMetadata,
};

export const usePgDumboDriver = () => {
  dumboDatabaseDriverRegistry.register(PgDriverType, pgDumboDriver);
};

usePgDumboDriver();

export * from './connections';
export * from './execute';
export * from './serialization';
