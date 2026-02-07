import type { DatabaseDriverType } from '../../..';

export * from './connections';
export * from './errors';
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
