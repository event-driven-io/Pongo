import type { DatabaseConnectionString } from '../../../all';

export type SQLitePragmaOptions = {
  journal_mode?: 'DELETE' | 'TRUNCATE' | 'PERSIST' | 'MEMORY' | 'WAL' | 'OFF';
  synchronous?: 'OFF' | 'NORMAL' | 'FULL' | 'EXTRA';
  cache_size?: number;
  foreign_keys?: boolean;
  temp_store?: 'DEFAULT' | 'FILE' | 'MEMORY';
  busy_timeout?: number;
  mmap_size?: number;
};

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

export const parsePragmasFromConnectionString = (
  connectionString: string | SQLiteConnectionString,
): Partial<SQLitePragmaOptions> => {
  const str = String(connectionString);

  if (!str.startsWith('file:')) {
    return {};
  }

  const url = new URL(str);
  const params = url.searchParams;
  const pragmas: Partial<SQLitePragmaOptions> = {};

  const journalMode = params.get('journal_mode');
  if (journalMode !== null) {
    pragmas.journal_mode = journalMode as
      | 'DELETE'
      | 'TRUNCATE'
      | 'PERSIST'
      | 'MEMORY'
      | 'WAL'
      | 'OFF';
  }

  const synchronous = params.get('synchronous');
  if (synchronous !== null) {
    pragmas.synchronous = synchronous as 'OFF' | 'NORMAL' | 'FULL' | 'EXTRA';
  }

  const cacheSize = params.get('cache_size');
  if (cacheSize !== null) {
    pragmas.cache_size = parseInt(cacheSize, 10);
  }

  const foreignKeys = params.get('foreign_keys');
  if (foreignKeys !== null) {
    const val = foreignKeys.toLowerCase();
    pragmas.foreign_keys = val === 'true' || val === 'on' || val === '1';
  }

  const tempStore = params.get('temp_store');
  if (tempStore !== null) {
    pragmas.temp_store = tempStore.toUpperCase() as
      | 'DEFAULT'
      | 'FILE'
      | 'MEMORY';
  }

  const busyTimeout = params.get('busy_timeout');
  if (busyTimeout !== null) {
    pragmas.busy_timeout = parseInt(busyTimeout, 10);
  }

  const mmapSize = params.get('mmap_size');
  if (mmapSize !== null) {
    pragmas.mmap_size = parseInt(mmapSize, 10);
  }

  return pragmas;
};
