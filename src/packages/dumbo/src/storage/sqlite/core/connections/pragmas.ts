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

export const buildPragmaStatements = (
  pragmas: SQLitePragmaOptions,
): Array<{ pragma: string; value: string | number }> => {
  return [
    { pragma: 'journal_mode', value: pragmas.journal_mode! },
    { pragma: 'synchronous', value: pragmas.synchronous! },
    { pragma: 'cache_size', value: pragmas.cache_size! },
    { pragma: 'foreign_keys', value: pragmas.foreign_keys ? 'ON' : 'OFF' },
    { pragma: 'temp_store', value: pragmas.temp_store! },
    { pragma: 'busy_timeout', value: pragmas.busy_timeout! },
  ];
};
