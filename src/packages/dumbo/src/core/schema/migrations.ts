import {
  mapToCamelCase,
  rawSql,
  singleOrNull,
  sql,
  tracer,
  type SchemaComponent,
  type SQLExecutor,
} from '..';
import { type DatabaseLock, type DatabaseLockOptions, type Dumbo } from '../..';

export type MigrationStyle = 'None' | 'CreateOrUpdate';

export type SQLMigration = {
  name: string;
  sqls: string[];
};

export const sqlMigration = (name: string, sqls: string[]): SQLMigration => ({
  name,
  sqls,
});

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
    migrationTable: SchemaComponent;
  };
  lock: {
    databaseLock: DatabaseLock;
    options?: Omit<DatabaseLockOptions, 'lockId'> &
      Partial<Pick<DatabaseLockOptions, 'lockId'>>;
  };
  dryRun?: boolean | undefined;
  ignoreMigrationHashMismatch?: boolean | undefined;
};

export type RunSQLMigrationsResult = {
  applied: SQLMigration[];
  skipped: SQLMigration[];
};

export const runSQLMigrations = (
  pool: Dumbo,
  migrations: ReadonlyArray<SQLMigration>,
  options: MigratorOptions,
): Promise<RunSQLMigrationsResult> =>
  pool.withTransaction(async ({ execute }) => {
    const { databaseLock, ...rest } = options.lock;

    const lockOptions: DatabaseLockOptions = {
      lockId: MIGRATIONS_LOCK_ID,
      ...rest,
    };

    const coreMigrations = options.schema.migrationTable.migrations({
      connector: 'PostgreSQL:pg', // TODO: This will need to change to support more connectors
    });

    const result: RunSQLMigrationsResult = { applied: [], skipped: [] };

    await databaseLock.withAcquire(
      execute,
      async () => {
        for (const migration of coreMigrations) {
          const sql = combineMigrations(migration);
          await execute.command(rawSql(sql));
        }

        for (const migration of migrations) {
          const wasApplied = await runSQLMigration(execute, migration, {
            ignoreMigrationHashMismatch:
              options.ignoreMigrationHashMismatch ?? false,
          });
          if (wasApplied) {
            result.applied.push(migration);
          } else {
            result.skipped.push(migration);
          }
        }
      },
      lockOptions,
    );

    return { success: options.dryRun ? false : true, result };
  });

const runSQLMigration = async (
  execute: SQLExecutor,
  migration: SQLMigration,
  options?: { ignoreMigrationHashMismatch?: boolean },
): Promise<boolean> => {
  const sql = combineMigrations(migration);
  const sqlHash = await getMigrationHash(sql);

  try {
    const newMigration = {
      name: migration.name,
      sqlHash,
    };

    const checkResult = await ensureMigrationWasNotAppliedYet(
      execute,
      newMigration,
    );

    if (checkResult.success === false) {
      if (options?.ignoreMigrationHashMismatch !== true)
        throw new Error(
          `Migration hash mismatch for "${migration.name}". Aborting migration.`,
        );

      tracer.warn('migration-hash-mismatch', {
        migrationName: migration.name,
        expectedHash: sqlHash,
        actualHash: checkResult.hashFromDB,
      });

      await updateMigrationHash(execute, newMigration);

      return false;
    }

    await execute.command(rawSql(sql));

    await recordMigration(execute, newMigration);
    return true;
  } catch (error) {
    tracer.error('migration-error', {
      migationName: migration.name,
      error: error,
    });
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

export const combineMigrations = (...migration: Pick<SQLMigration, 'sqls'>[]) =>
  migration.flatMap((m) => m.sqls).join('\n');

type EnsureMigrationResult =
  | { success: true }
  | { success: false; hashFromDB: string };

const ensureMigrationWasNotAppliedYet = async (
  execute: SQLExecutor,
  migration: { name: string; sqlHash: string },
): Promise<EnsureMigrationResult> => {
  const result = await singleOrNull(
    execute.query<{ sql_hash: string }>(
      sql(`SELECT sql_hash FROM migrations WHERE name = %L`, migration.name),
    ),
  );

  if (result === null) return { success: true };

  const { sqlHash } = mapToCamelCase<Pick<MigrationRecord, 'sqlHash'>>(result);

  if (sqlHash !== migration.sqlHash) {
    return { success: false, hashFromDB: sqlHash };
  }

  return { success: true };
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

const updateMigrationHash = async (
  execute: SQLExecutor,
  migration: { name: string; sqlHash: string },
): Promise<void> => {
  await execute.command(
    sql(
      `
      UPDATE migrations
      SET sql_hash = %L, timestamp = NOW()
      WHERE name = %L
      `,
      migration.sqlHash,
      migration.name,
    ),
  );
};
