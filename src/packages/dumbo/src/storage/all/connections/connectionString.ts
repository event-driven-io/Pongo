import type { ConnectorTypeParts, DatabaseType } from '../../../core';
import type { PostgreSQLConnectionString } from '../../postgresql/core';
import type { SQLiteConnectionString } from '../../sqlite/core';

export type DatabaseConnectionString<
  DatabaseTypeName extends DatabaseType = DatabaseType,
  Format extends string = string,
> = Format & {
  _databaseType: DatabaseTypeName;
};

export type SupportedDatabaseConnectionString =
  | PostgreSQLConnectionString
  | SQLiteConnectionString;

export const parseConnectionString = (
  connectionString: SupportedDatabaseConnectionString | string,
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
