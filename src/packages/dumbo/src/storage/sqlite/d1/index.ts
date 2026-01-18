export * from './connections';
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
  type SQLiteConnectionFactoryOptions,
  type SQLiteDumboConnectionOptions,
} from '../core';
import {
  D1DriverType,
  d1Client,
  type D1Client,
  type D1ClientOptions,
  type D1Connection,
} from './connections';

export const d1Pool = (options: SQLiteDumboConnectionOptions<D1Connection>) =>
  sqlitePool({
    ...options,
    sqliteClient: d1Client,
  } as SQLiteDumboConnectionOptions<D1Connection> &
    SQLiteConnectionFactoryOptions<D1Client, D1ClientOptions>);

export const d1DatabaseDriver = {
  driverType: 'SQLite:d1' as const,
  createPool: (options) =>
    d1Pool(options as SQLiteDumboConnectionOptions<D1Connection>),
  sqlFormatter: sqliteFormatter,
  defaultMigratorOptions: DefaultSQLiteMigratorOptions,
  getDatabaseNameOrDefault: () => ':d1:', // TODO: make default database name not required
  defaultConnectionString: ':d1:', // TODO: make connection string not required
  tryParseConnectionString: () => null, // TODO: make connection string not required
} satisfies DumboDatabaseDriver<
  SQLiteConnection<D1DriverType>,
  SQLiteDumboConnectionOptions<D1Connection>,
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
