import { parsePragmasFromConnectionString } from './connectionString';
import {
  DEFAULT_SQLITE_PRAGMA_OPTIONS,
  type SQLitePragmaOptions,
} from './index';

export const mergePragmaOptions = (
  connectionString: string,
  userOptions?: Partial<SQLitePragmaOptions>,
): SQLitePragmaOptions => {
  const connectionStringPragmas =
    parsePragmasFromConnectionString(connectionString);

  return {
    ...DEFAULT_SQLITE_PRAGMA_OPTIONS,
    ...connectionStringPragmas,
    ...userOptions,
  };
};

export const buildConnectionPragmaStatements = (
  pragmas: SQLitePragmaOptions,
): Array<{ pragma: string; value: string | number }> => [
  // busy_timeout FIRST - enables waiting on locks for subsequent operations
  { pragma: 'busy_timeout', value: pragmas.busy_timeout! },
  { pragma: 'synchronous', value: pragmas.synchronous! },
  { pragma: 'cache_size', value: pragmas.cache_size! },
  { pragma: 'foreign_keys', value: pragmas.foreign_keys ? 'ON' : 'OFF' },
  { pragma: 'temp_store', value: pragmas.temp_store! },
];

export const buildDatabasePragmaStatements = (
  pragmas: SQLitePragmaOptions,
): Array<{ pragma: string; value: string | number }> => [
  { pragma: 'journal_mode', value: pragmas.journal_mode! },
];
