// export * from './connections';
// import {
//   dumboDatabaseDriverRegistry,
//   type DumboConnectionOptions,
//   type DumboDatabaseDriver,
// } from '../../../core';
// import {
//   DefaultSQLiteMigratorOptions,
//   InMemorySQLiteDatabase,
//   SQLiteConnectionString,
//   sqliteFormatter,
//   sqlitePool,
//   type SQLiteConnection,
//   type SQLiteDumboConnectionOptions,
// } from '../core';
// import { D1DriverType, d1Client } from './connections/connection';

// export const d1Pool = (options: SQLiteDumboConnectionOptions<D1DriverType>) =>
//   sqlitePool({
//     ...options,
//     sqliteClient: d1Client,
//   } as SQLiteDumboConnectionOptions<D1DriverType> & SQLitePoolConfig);

// export const d1DatabaseDriver = {
//   driverType: 'SQLite:d1' as const,
//   createPool: (options) =>
//     d1Pool(options as SQLiteDumboConnectionOptions<D1DriverType>),
//   sqlFormatter: sqliteFormatter,
//   defaultMigratorOptions: DefaultSQLiteMigratorOptions,
//   getDatabaseNameOrDefault: () => InMemorySQLiteDatabase,
//   defaultConnectionString: InMemorySQLiteDatabase,
//   tryParseConnectionString: (connectionString) => {
//     try {
//       return SQLiteConnectionString(connectionString);
//     } catch {
//       return null;
//     }
//   },
// } satisfies DumboDatabaseDriver<
//   SQLiteConnection<D1DriverType>,
//   SQLiteDumboConnectionOptions<D1DriverType>,
//   SQLiteConnectionString
// >;

// export const useD1DatabaseDriver = () => {
//   dumboDatabaseDriverRegistry.register(D1DriverType, d1DatabaseDriver);
// };

// export type D1DumboConnectionOptions = DumboConnectionOptions<
//   typeof d1DatabaseDriver
// >;

// useD1DatabaseDriver();

// export { d1DatabaseDriver as databaseDriver, d1Client as sqliteClient };

// export const connectionPool = sqlitePool;
