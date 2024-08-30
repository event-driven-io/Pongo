import { AdvisoryLock, type DatabaseLockOptions } from '../..';
import type { Dumbo } from '../../..';
import {
  type Migration,
  runSQLMigrations,
  MIGRATIONS_LOCK_ID,
} from '../../../core/schema';

export type PostgreSQLMigratorOptions = {
  lock?: {
    options?: Omit<DatabaseLockOptions, 'lockId'> &
      Partial<Pick<DatabaseLockOptions, 'lockId'>>;
  };
};

export const migrationTableSQL = `
  CREATE TABLE IF NOT EXISTS migrations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    application VARCHAR(255) NOT NULL DEFAULT 'default',
    sql_hash VARCHAR(64) NOT NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`;

export const runPostgreSQLMigrations = (
  pool: Dumbo,
  migrations: Migration[],
  options?: PostgreSQLMigratorOptions,
): Promise<void> =>
  runSQLMigrations(pool, migrations, {
    schema: {
      migrationTableSQL,
    },
    lock: {
      databaseLock: AdvisoryLock,
      options: {
        ...(options ?? {}),
        lockId: MIGRATIONS_LOCK_ID,
      },
    },
  });
