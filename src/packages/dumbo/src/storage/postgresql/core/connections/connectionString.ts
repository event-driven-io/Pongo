import type { DatabaseConnectionString } from '../../../all';
import { defaultPostgreSqlDatabase } from '../schema';

export const defaultPostgreSQLConnectionString: PostgreSQLConnectionString =
  'postgresql://postgres@localhost:5432/postgres' as PostgreSQLConnectionString;

export const getDatabaseNameOrDefault = (connectionString: string) =>
  parseDatabaseName(connectionString) ?? defaultPostgreSqlDatabase;

export type PostgreSQLConnectionString = DatabaseConnectionString<
  'PostgreSQL',
  `postgresql://${string}` | `postgres://${string}`
>;

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

// Stripped from  https://github.com/brianc/node-postgres
// Copyright (c) 2010-2014 Brian Carlson (brian.m.carlson@gmail.com)
// MIT License
/**
 * Parse database name from a PostgreSQL connection string
 */
export function parseDatabaseName(str: string): string | null {
  // Unix socket format: /path/to/socket database_name
  if (str.charAt(0) === '/') {
    const parts = str.split(' ');
    return parts[1] || null;
  }

  // Encode spaces if present
  if (/ |%[^a-f0-9]|%[a-f0-9][^a-f0-9]/i.test(str)) {
    str = encodeURI(str).replace(/%25(\d\d)/g, '%$1');
  }

  let result: URL;
  try {
    result = new URL(str, 'postgres://base');
  } catch {
    // Try with dummy host for malformed URLs
    try {
      result = new URL(str.replace('@/', '@___DUMMY___/'), 'postgres://base');
    } catch {
      return null;
    }
  }

  // Socket protocol: socket://path?db=dbname
  if (result.protocol === 'socket:') {
    return result.searchParams.get('db');
  }

  // Standard URL: postgres://user:pass@host:port/database
  const pathname = result.pathname.slice(1) || null;
  return pathname ? decodeURI(pathname) : null;
}
