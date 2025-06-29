import pgcs from 'pg-connection-string';
import { defaultPostgreSqlDatabase } from '../schema';

export const defaultPostgreSQLConnectionString: PostgreSQLConnectionString =
  'postgresql://postgres@localhost:5432/postgres' as PostgreSQLConnectionString;

export const getDatabaseNameOrDefault = (connectionString: string) =>
  pgcs.parse(connectionString).database ?? defaultPostgreSqlDatabase;

export type PostgreSQLConnectionString =
  | `postgresql://${string}`
  | `postgres://${string}`;

export const PostgreSQLConnectionString = (
  connectionString: string,
): PostgreSQLConnectionString => {
  if (
    !connectionString.startsWith('postgresql://') &&
    !connectionString.startsWith('postgres://')
  ) {
    throw new Error(
      `Invalid PostgreSQL connection string: ${connectionString}. It should start with "postgresql://".`,
    );
  }
  return connectionString as PostgreSQLConnectionString;
};
