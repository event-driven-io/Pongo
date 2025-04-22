import type { ConnectorTypeParts } from '../../../core';
import type { PostgreSQLConnectionString } from '../../postgresql/core';
import type { SQLiteConnectionString } from '../../sqlite/core';

export type DatabaseConnectionString =
  | PostgreSQLConnectionString
  | SQLiteConnectionString;

export const parseConnectionString = (
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  connectionString: DatabaseConnectionString | string,
): ConnectorTypeParts => {
  if (
    connectionString.startsWith('postgresql://') ||
    connectionString.startsWith('postgres://')
  ) {
    return {
      databaseType: 'PostgreSQL',
      driverName: 'pg',
    };
  }

  if (
    connectionString.startsWith('file:') ||
    connectionString === ':memory:' ||
    connectionString.startsWith('/') ||
    connectionString.startsWith('./')
  ) {
    return {
      databaseType: 'SQLite',
      driverName: 'sqlite3',
    };
  }

  throw new Error(
    `Unsupported database connection string: ${connectionString}`,
  );
};
