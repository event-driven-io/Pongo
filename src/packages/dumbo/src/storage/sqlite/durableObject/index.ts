export * from './connections';
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
import {
  CloudflareDurableObjectSQLiteDriverType,
  type CloudflareDurableObjectSQLiteConnection,
} from './connections';
import {
  cloudflareDurableObjectSQLitePool,
  type CloudflareDurableObjectSQLiteConnectionPool,
  type CloudflareDurableObjectSQLitePoolOptions,
} from './pool';

export type CloudflareDurableObjectSQLiteDumboOptions =
  CloudflareDurableObjectSQLitePoolOptions;

export const cloudflareDurableObjectSQLiteDumboDriver = {
  driverType: CloudflareDurableObjectSQLiteDriverType,
  createPool: cloudflareDurableObjectSQLitePool,
  sqlFormatter: sqliteFormatter,
  defaultMigratorOptions: DefaultSQLiteMigratorOptions,
  canHandle: (options) =>
    options.driverType === CloudflareDurableObjectSQLiteDriverType &&
    ('storage' in options || 'client' in options || 'connection' in options),
  databaseMetadata: sqliteMetadata,
} satisfies DumboDatabaseDriver<
  CloudflareDurableObjectSQLiteConnection,
  CloudflareDurableObjectSQLiteDumboOptions,
  CloudflareDurableObjectSQLiteConnectionPool
>;

export const useCloudflareDurableObjectSQLiteDumboDriver = () => {
  dumboDatabaseDriverRegistry.register(
    CloudflareDurableObjectSQLiteDriverType,
    cloudflareDurableObjectSQLiteDumboDriver,
  );
};

export type CloudflareDurableObjectSQLiteDumboConnectionOptions =
  DumboConnectionOptions<typeof cloudflareDurableObjectSQLiteDumboDriver>;

useCloudflareDurableObjectSQLiteDumboDriver();

export * from './execute';
export * from './pool';
export * from './transactions';
