import type { DatabaseConnectionString } from '../../../all';

export type SQLiteConnectionString = DatabaseConnectionString<
  'SQLite',
  `file:${string}` | `:memory:` | `/${string}` | `./${string}`
>;

export const SQLiteConnectionString = (
  connectionString: string,
): SQLiteConnectionString => {
  if (
    !connectionString.startsWith('file:') &&
    connectionString !== ':memory:' &&
    !connectionString.startsWith('/') &&
    !connectionString.startsWith('./')
  ) {
    throw new Error(
      `Invalid SQLite connection string: ${connectionString}. It should start with "file:", ":memory:", "/", or "./".`,
    );
  }
  return connectionString as SQLiteConnectionString;
};
