import { type Dumbo, type MigratorOptions } from '../../..';
import {
  MIGRATIONS_LOCK_ID,
  rawSql,
  runSQLMigrations,
  type DatabaseLockOptions,
  type Migration,
  type SQL,
} from '../../../core';
import { AdvisoryLock } from '../locks';

export type PostgreSQLMigratorOptions = {
  lock?: {
    options?: Omit<DatabaseLockOptions, 'lockId'> &
      Partial<Pick<DatabaseLockOptions, 'lockId'>>;
  };
};

export const migrationTableSQL: SQL = rawSql(`
  CREATE TABLE IF NOT EXISTS migrations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    application VARCHAR(255) NOT NULL DEFAULT 'default',
    sql_hash VARCHAR(64) NOT NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

export const postgreSQLMigrationOptions: MigratorOptions = {
  schema: {
    migrationTableSQL,
  },
  lock: {
    databaseLock: AdvisoryLock,
    options: {
      lockId: MIGRATIONS_LOCK_ID,
    },
  },
};

export const runPostgreSQLMigrations = (
  pool: Dumbo,
  migrations: Migration[],
  options?: PostgreSQLMigratorOptions,
): Promise<void> =>
  runSQLMigrations(pool, migrations, {
    ...postgreSQLMigrationOptions,
    lock: {
      ...postgreSQLMigrationOptions.lock,
      options: {
        ...postgreSQLMigrationOptions.lock.options,
        ...(options ?? {}),
      },
    },
  });
