import type { Dumbo } from '../..';
import {
  mapToCamelCase,
  rawSql,
  singleOrNull,
  sql,
  type SQLExecutor,
} from '../../core';
import {
  acquireAdvisoryLock,
  type AcquireAdvisoryLockOptions,
  defaultAcquireAdvisoryLockOptions,
  releaseAdvisoryLock,
} from '../core';

export type Migration = {
  name: string;
  sqls: string[];
};

export type MigrationRecord = {
  id: number;
  name: string;
  application: string;
  sqlHash: string;
  timestamp: Date;
};
export const MIGRATIONS_LOCK_ID = 999956789;

export type MigratorOptions = {
  lock?: Omit<AcquireAdvisoryLockOptions, 'lockId'> &
    Partial<Pick<AcquireAdvisoryLockOptions, 'lockId'>>;
};
export const defaultMigratorOptions: Required<MigratorOptions> = {
  lock: { lockId: MIGRATIONS_LOCK_ID, ...defaultAcquireAdvisoryLockOptions },
};

export const runMigrations = (
  pool: Dumbo,
  migrations: Migration[],
  options: MigratorOptions = defaultMigratorOptions,
): Promise<void> =>
  pool.withTransaction(async (transaction) => {
    for (const migration of migrations) {
      await runMigration(transaction.execute, migration, options);
    }
  });

export const runMigration = async (
  execute: SQLExecutor,
  migration: Migration,
  options: MigratorOptions = defaultMigratorOptions,
): Promise<void> => {
  const sql = combineMigrations(migration);
  const sqlHash = await getMigrationHash(sql);

  const lockOptions: AcquireAdvisoryLockOptions = {
    lockId: MIGRATIONS_LOCK_ID,
    ...(options.lock ?? {}),
  };

  try {
    await acquireAdvisoryLock(execute, lockOptions);

    try {
      // Ensure the migrations table exists
      await setupMigrationTable(execute);

      const newMigration = {
        name: migration.name,
        sqlHash,
      };

      const wasMigrationApplied = await ensureMigrationWasNotAppliedYet(
        execute,
        newMigration,
      );

      if (wasMigrationApplied) return;

      await execute.command(rawSql(sql));

      await recordMigration(execute, newMigration);
    } finally {
      await releaseAdvisoryLock(execute, lockOptions);
    }
    // console.log(`Migration "${newMigration.name}" applied successfully.`);
  } catch (error) {
    console.error(`Failed to apply migration "${migration.name}":`, error);
    throw error;
  }
};

const getMigrationHash = async (content: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
};

const combineMigrations = (migration: Pick<Migration, 'sqls'>) =>
  migration.sqls.join('\n');

const migrationTableSQL = `
  CREATE TABLE IF NOT EXISTS migrations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    application VARCHAR(255) NOT NULL DEFAULT 'default',
    sql_hash VARCHAR(64) NOT NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`;

const setupMigrationTable = async (execute: SQLExecutor) => {
  await execute.command(rawSql(migrationTableSQL));
};

const ensureMigrationWasNotAppliedYet = async (
  execute: SQLExecutor,
  migration: { name: string; sqlHash: string },
): Promise<boolean> => {
  const result = await singleOrNull(
    execute.query<{ sql_hash: string }>(
      sql(`SELECT sql_hash FROM migrations WHERE name = %L`, migration.name),
    ),
  );

  if (result === null) return false;

  const { sqlHash } = mapToCamelCase<Pick<MigrationRecord, 'sqlHash'>>(result);

  if (sqlHash !== migration.sqlHash) {
    throw new Error(
      `Migration hash mismatch for "${migration.name}". Aborting migration.`,
    );
  }

  //console.log(`Migration "${migration.name}" already applied. Skipping.`);
  return true;
};

const recordMigration = async (
  execute: SQLExecutor,
  migration: { name: string; sqlHash: string },
): Promise<void> => {
  await execute.command(
    sql(
      `
      INSERT INTO migrations (name, sql_hash)
      VALUES (%L, %L)
      `,
      migration.name,
      migration.sqlHash,
    ),
  );
};
