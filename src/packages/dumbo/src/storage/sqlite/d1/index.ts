export * from './connections';
import {
  createSingletonConnectionPool,
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
  type SQLitePoolOptions,
} from '../core';
import {
  D1DriverType,
  d1Client,
  d1Connection,
  type D1ClientOptions,
  type D1Connection,
} from './connections';

export type D1DumboOptions = Omit<
  SQLitePoolOptions<D1Connection>,
  'driverType'
> &
  D1ClientOptions;

export const d1Pool = (options: D1DumboOptions) =>
  createSingletonConnectionPool<D1Connection>({
    driverType: D1DriverType,
    getConnection: () => d1Connection(options),
  });

export const d1DatabaseDriver = {
  driverType: D1DriverType,
  createPool: (options) => d1Pool(options),
  sqlFormatter: sqliteFormatter,
  defaultMigratorOptions: DefaultSQLiteMigratorOptions,
  getDatabaseNameOrDefault: () => ':d1:', // TODO: make default database name not required
  defaultConnectionString: ':d1:', // TODO: make connection string not required
  tryParseConnectionString: () => null, // TODO: make connection string not required
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
>;

useD1DatabaseDriver();

export { d1DatabaseDriver as databaseDriver, d1Client as sqliteClient };

export const connectionPool = sqlitePool;
