export * from './connections';
import type { D1Database } from '@cloudflare/workers-types';
import type { D1ConnectionPool } from '../../../cloudflare';
import {
  dumboDatabaseDriverRegistry,
  type DumboConnectionOptions,
  type DumboDatabaseDriver,
} from '../../../core';
import {
  DefaultSQLiteMigratorOptions,
  sqliteFormatter,
  sqliteMetadata,
} from '../core';
import { D1DriverType, type D1Connection } from './connections';
import { d1Pool, type D1PoolOptions } from './pool';

export type D1DumboOptions = D1PoolOptions;

export const d1DumboDriver: DumboDatabaseDriver<
  D1Connection,
  D1DumboOptions,
  D1ConnectionPool
> = {
  driverType: D1DriverType,
  createPool: (options) => d1Pool(options),
  sqlFormatter: sqliteFormatter,
  defaultMigratorOptions: DefaultSQLiteMigratorOptions,
  canHandle: (options) => {
    return options.driverType === D1DriverType && 'database' in options;
  },
  databaseMetadata: {
    ...sqliteMetadata,
    defaultDatabase: 'd1:default',
    getDatabaseNameOrDefault: () => 'd1:default',
  },
};

export const useD1DumboDriver = () => {
  dumboDatabaseDriverRegistry.register(D1DriverType, d1DumboDriver);
};

export type D1DumboConnectionOptions = DumboConnectionOptions<
  typeof d1DumboDriver
> & { database: D1Database };

useD1DumboDriver();

export * from './connections';
export * from './errors';
export * from './execute';
export * from './formatter';
export * from './pool';
export * from './transactions';
