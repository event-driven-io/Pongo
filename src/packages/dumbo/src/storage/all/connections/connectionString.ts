import type { DatabaseDriverTypeParts, DatabaseType } from '../../../core';

export type DatabaseConnectionString<
  DatabaseTypeName extends DatabaseType = DatabaseType,
  Format extends string = string,
> = Format & {
  _databaseType: DatabaseTypeName;
};

export const parseConnectionString = (
  connectionString: DatabaseConnectionString | string,
): DatabaseDriverTypeParts => {
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

  if (connectionString.startsWith('d1:')) {
    return {
      databaseType: 'SQLite',
      driverName: 'd1',
    };
  }

  throw new Error(
    `Unsupported database connection string: ${connectionString}`,
  );
};
