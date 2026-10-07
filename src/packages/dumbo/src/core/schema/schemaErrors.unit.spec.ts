import { describe, it } from 'vitest';
import type { Dumbo } from '..';
import {
  assertRejectsDumboError,
  assertThrowsDumboError,
} from '../../testing/errorAssertions';
import type { SQLExecutor } from '../execute';
import { registerFormatter, SQL, SQLFormatter } from '../sql';
import {
  getDefaultMigratorOptionsFromRegistry,
  registerDefaultMigratorOptions,
  runSQLMigrations,
} from './migrators';
import { dumboDatabaseMetadataRegistry } from './databaseMetadata';
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
dumboDatabaseMetadataRegistry.register(migratorDatabaseType, {
  databaseType: migratorDatabaseType,
  defaultDatabaseName: 'test',
  capabilities: {
    supportsMultipleDatabases: false,
    supportsSchemas: false,
    supportsFunctions: false,
  },
  tableExists: () => Promise.resolve(true),
});

const databaseTypeWithoutMetadata = 'SchemaErrorsWithoutMetadataTest';

registerFormatter(databaseTypeWithoutMetadata, alwaysRenderingFormatter);
registerDefaultMigratorOptions(databaseTypeWithoutMetadata, {});

const noopExecutor = {
  query: () => Promise.resolve({ rowCount: 0, rows: [] }),
  batchQuery: () => Promise.resolve([]),
  command: () => Promise.resolve({ rowCount: 0, rows: [] }),
  batchCommand: () => Promise.resolve([]),
} satisfies SQLExecutor;

const executorWithRecordedHash = (name: string, sqlHash: string): SQLExecutor =>
  ({
    ...noopExecutor,
    query: () => Promise.resolve({ rowCount: 1, rows: [{ name, sqlHash }] }),
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

  it('fails with a NotRegisteredError when running migrations for a database type without metadata', () =>
    assertRejectsDumboError(
      () =>
        runSQLMigrations(
          {
            driverType: `${databaseTypeWithoutMetadata}:test`,
          } as unknown as Dumbo,
          [sqlMigration('without-metadata:001', [SQL`SELECT 1`])],
          { execute: noopExecutor },
        ),
      {
        errorType: 'NotRegisteredError',
        errorCode: 500,
        message: `No database metadata registered for database type: ${databaseTypeWithoutMetadata}`,
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
              'mismatched:001',
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
