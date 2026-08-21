import { describe, it } from 'vitest';
import type { Dumbo } from '..';
import {
  assertRejectsDumboError,
  assertThrowsDumboError,
} from '../errors/errorAssertions';
import type { SQLExecutor } from '../execute';
import { registerFormatter, SQL, SQLFormatter } from '../sql';
import {
  getDefaultMigratorOptionsFromRegistry,
  registerDefaultMigratorOptions,
  runSQLMigrations,
} from './migrators';
import { sqlMigration } from './sqlMigration';

const migratorDatabaseType = 'SchemaErrorsTest';

const migratorPool = {
  driverType: `${migratorDatabaseType}:test`,
} as unknown as Dumbo;

const alwaysRenderingFormatter: SQLFormatter = SQLFormatter({
  format: () => ({ query: 'SELECT 1', params: [] }),
  describe: () => 'SELECT 1',
});

registerFormatter(migratorDatabaseType, alwaysRenderingFormatter);
registerDefaultMigratorOptions(migratorDatabaseType, {});

const noopExecutor = {
  query: () => Promise.resolve({ rowCount: 0, rows: [] }),
  batchQuery: () => Promise.resolve([]),
  command: () => Promise.resolve({ rowCount: 0, rows: [] }),
  batchCommand: () => Promise.resolve([]),
} satisfies SQLExecutor;

const executorWithRecordedHash = (sqlHash: string): SQLExecutor =>
  ({
    ...noopExecutor,
    query: () => Promise.resolve({ rowCount: 1, rows: [{ sqlHash }] }),
  }) as unknown as SQLExecutor;

const tooLongMigrationName = 'a'.repeat(256);

describe('migrator typed errors', () => {
  it('fails with a NotRegisteredError for a database type without default migrator options', () =>
    assertThrowsDumboError(
      () => getDefaultMigratorOptionsFromRegistry('NotRegisteredDatabaseType'),
      {
        errorType: 'NotRegisteredError',
        errorCode: 500,
        message:
          'No default migrator options registered for database type: NotRegisteredDatabaseType',
      },
    ));

  it('fails with an InvalidOperationError for a migration name the ledger column cannot hold', () =>
    assertRejectsDumboError(
      () =>
        runSQLMigrations(
          migratorPool,
          [sqlMigration(tooLongMigrationName, [SQL`SELECT 1`])],
          { execute: noopExecutor },
        ),
      {
        errorType: 'InvalidOperationError',
        errorCode: 400,
        message: `Migration name "${tooLongMigrationName}" is 256 characters long, exceeding the maximum of 255 characters.`,
      },
    ));

  it('fails with an InvalidOperationError when the recorded migration hash does not match', () =>
    assertRejectsDumboError(
      () =>
        runSQLMigrations(
          migratorPool,
          [sqlMigration('mismatched:001', [SQL`SELECT 1`])],
          {
            execute: executorWithRecordedHash(
              'hash-recorded-by-a-different-migration',
            ),
          },
        ),
      {
        errorType: 'InvalidOperationError',
        errorCode: 400,
        message:
          'Migration hash mismatch for "mismatched:001". Aborting migration.',
      },
    ));
});
