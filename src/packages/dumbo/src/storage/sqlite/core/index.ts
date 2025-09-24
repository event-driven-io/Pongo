import { getDatabaseDriverName, type DatabaseDriverType } from '../../..';
import type { SQLiteClientFactory } from './connections';

export * from './connections';
export * from './execute';
export * from './pool';
export * from './schema';
export * from './sql';
export * from './transactions';

export type SQLiteDatabaseName = 'SQLite';
export const SQLiteDatabaseName = 'SQLite';

export type SQLiteDriverType<DriverName extends string = string> =
  DatabaseDriverType<SQLiteDatabaseName, DriverName>;

export type SQLiteDatabaseType = 'SQLite';

export const sqliteClientProvider = async <
  DriverType extends SQLiteDriverType = SQLiteDriverType,
>(
  driverType: DriverType,
): Promise<SQLiteClientFactory> => {
  const driverName = getDatabaseDriverName(driverType);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const driverModule = await import(`../${driverName.toLowerCase()}`);

  if (!('sqliteClient' in driverModule))
    throw new Error(
      `The driver type module "${driverType}" does not export a sqliteClient`,
    );

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return driverModule.sqliteClient as SQLiteClientFactory;
};
