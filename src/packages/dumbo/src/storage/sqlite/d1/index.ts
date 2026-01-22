export * from './connections';
import type { D1Database } from '@cloudflare/workers-types';
import {
  dumboDatabaseDriverRegistry,
  type DumboConnectionOptions,
  type DumboDatabaseDriver,
} from '../../../core';
import {
  DefaultSQLiteMigratorOptions,
  SQLiteConnectionString,
  sqliteFormatter,
  sqlitePool,
  type SQLiteConnection,
} from '../core';
import { D1DriverType, d1Client } from './connections';
import { d1Pool, type D1PoolOptions } from './pool';

export type D1DumboOptions = D1PoolOptions;

export const d1DatabaseDriver = {
  driverType: D1DriverType,
  createPool: (options) => d1Pool(options),
  sqlFormatter: sqliteFormatter,
  defaultMigratorOptions: DefaultSQLiteMigratorOptions,
  getDatabaseNameOrDefault: () => 'd1:default', // TODO: make default database name not required
  canHandle: (options) => {
    return options.driverType === D1DriverType && 'database' in options;
  }, // TODO: make connection string not required
} satisfies DumboDatabaseDriver<
  SQLiteConnection<D1DriverType>,
  D1DumboOptions,
  SQLiteConnectionString
>;

export const useD1DatabaseDriver = () => {
  dumboDatabaseDriverRegistry.register(D1DriverType, d1DatabaseDriver);
};

export type D1DumboConnectionOptions = DumboConnectionOptions<
  typeof d1DatabaseDriver
> & { database: D1Database };

useD1DatabaseDriver();

export { d1Pool, d1DatabaseDriver as databaseDriver, d1Client as sqliteClient };

export const connectionPool = sqlitePool;
