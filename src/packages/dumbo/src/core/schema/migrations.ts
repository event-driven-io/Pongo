import {
  mapToCamelCase,
  rawSql,
  singleOrNull,
  sql,
  type SQLExecutor,
} from '..';
import { type DatabaseLock, type DatabaseLockOptions, type Dumbo } from '../..';

export type MigrationStyle = 'None' | 'CreateOrUpdate';

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
  schema: {
    migrationTableSQL: string;
  };
  lock: {
    databaseLock: DatabaseLock;
    options?: Omit<DatabaseLockOptions, 'lockId'> &
      Partial<Pick<DatabaseLockOptions, 'lockId'>>;
  };
};

export const runSQLMigrations = (
  pool: Dumbo,
  migrations: Migration[],
  options: MigratorOptions,
): Promise<void> =>
  pool.withTransaction(async (transaction) => {
    for (const migration of migrations) {
      await runSQLMigration(transaction.execute, migration, options);
    }
  });

export const runSQLMigration = async (
  execute: SQLExecutor,
  migration: Migration,
  options: MigratorOptions,
): Promise<void> => {
  const sql = combineMigrations(migration);
  const sqlHash = await getMigrationHash(sql);

  const { databaseLock, ...rest } = options.lock;

  const lockOptions: DatabaseLockOptions = {
    lockId: MIGRATIONS_LOCK_ID,
    ...rest,
  };

  try {
    await databaseLock.withAcquire(
      execute,
      async () => {
        // Ensure the migrations table exists
        await setupMigrationTable(execute, options.schema.migrationTableSQL);

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
      },
      lockOptions,
    );
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

export const combineMigrations = (...migration: Pick<Migration, 'sqls'>[]) =>
  migration.flatMap((m) => m.sqls).join('\n');

const setupMigrationTable = async (
  execute: SQLExecutor,
  migrationTableSQL: string,
) => {
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
