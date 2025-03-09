import {
  MIGRATIONS_LOCK_ID,
  rawSql,
  runSQLMigrations,
  schemaComponent,
  sqlMigration,
  type DatabaseLockOptions,
  type Dumbo,
  type SQLMigration,
} from '../../../../core';
import { AdvisoryLock } from '../locks';

export type PostgreSQLMigratorOptions = {
  lock?: {
    options?: Omit<DatabaseLockOptions, 'lockId'> &
      Partial<Pick<DatabaseLockOptions, 'lockId'>>;
  };
  dryRun?: boolean | undefined;
};

const migrationTableSQL = rawSql(`
  CREATE TABLE IF NOT EXISTS migrations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    application VARCHAR(255) NOT NULL DEFAULT 'default',
    sql_hash VARCHAR(64) NOT NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

export const migrationTableSchemaComponent = schemaComponent(
  'dumbo:schema-component:migrations-table',
  {
    migrations: () => [
      sqlMigration('dumbo:migrationTable:001', [migrationTableSQL]),
    ],
  },
);

export const runPostgreSQLMigrations = (
  pool: Dumbo,
  migrations: SQLMigration[],
  options?: PostgreSQLMigratorOptions,
): Promise<void> =>
  runSQLMigrations(pool, migrations, {
    schema: {
      migrationTable: migrationTableSchemaComponent,
    },
    lock: {
      databaseLock: AdvisoryLock,
      options: {
        ...(options ?? {}),
        lockId: MIGRATIONS_LOCK_ID,
      },
    },
    dryRun: options?.dryRun,
  });
