import type { DatabaseDriverType } from '../../../core';

export * from './connections';
export * from './locks';
export * from './schema';
export * from './sql';

export type PostgreSQLDatabaseName = 'PostgreSQL';
export const PostgreSQLDatabaseName = 'PostgreSQL';

export type PostgreSQLDriverType<DriverName extends string = string> =
  DatabaseDriverType<PostgreSQLDatabaseName, DriverName>;
