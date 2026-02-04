import { type Dumbo, JSONSerializer } from '../..';
import { type DatabaseType, fromDatabaseDriverType } from '../../drivers';
import type { SQLExecutor } from '../../execute';
import {
  type DatabaseLock,
  type DatabaseLockOptions,
  NoDatabaseLock,
} from '../../locks';
import { singleOrNull } from '../../query';
import { SQL, SQLFormatter, getFormatter } from '../../sql';
import { tracer } from '../../tracing';
import { type SchemaComponent } from '../schemaComponent';
import type { SQLMigration } from '../sqlMigration';
import { migrationTableSchemaComponent } from './schemaComponentMigrator';

export const MIGRATIONS_LOCK_ID = 999956789;

declare global {
  var defaultMigratorOptions: Record<DatabaseType, MigratorOptions>;
}

const defaultMigratorOptions = (globalThis.defaultMigratorOptions =
  globalThis.defaultMigratorOptions ??
  ({} as Record<DatabaseType, MigratorOptions>));

export const registerDefaultMigratorOptions = (
  databaseType: DatabaseType,
  options: MigratorOptions,
): void => {
  defaultMigratorOptions[databaseType] = options;
};

export const getDefaultMigratorOptionsFromRegistry = (
  databaseType: DatabaseType,
): MigratorOptions => {
  if (!defaultMigratorOptions[databaseType]) {
    throw new Error(
      `No default migrator options registered for database type: ${databaseType}`,
    );
  }
  return defaultMigratorOptions[databaseType];
};

export type MigratorOptions = {
  schema?: {
    migrationTable?: SchemaComponent;
  };
  lock?: {
    databaseLock?: DatabaseLock;
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
  partialOptions?: Partial<MigratorOptions>,
): Promise<RunSQLMigrationsResult> =>
  pool.withTransaction(async ({ execute }) => {
    const databaseType = fromDatabaseDriverType(pool.driverType).databaseType;
    const defaultOptions = getDefaultMigratorOptionsFromRegistry(databaseType);
    partialOptions ??= {};

    const options: MigratorOptions = {
      ...defaultOptions,
      ...partialOptions,
      schema: {
        ...defaultOptions.schema,
        ...(partialOptions?.schema ?? {}),
      },
      lock: {
        ...defaultOptions.lock,
        ...partialOptions?.lock,
        options: {
          lockId: MIGRATIONS_LOCK_ID,
          ...defaultOptions.lock?.options,
          ...partialOptions?.lock?.options,
        },
      },
      dryRun: defaultOptions.dryRun ?? partialOptions?.dryRun,
      ignoreMigrationHashMismatch:
        defaultOptions.ignoreMigrationHashMismatch ??
        partialOptions?.ignoreMigrationHashMismatch,
    };

    const { databaseLock: _, ...rest } = options.lock ?? {};

    const databaseLock = options.lock?.databaseLock ?? NoDatabaseLock;

    const lockOptions: DatabaseLockOptions = {
      lockId: MIGRATIONS_LOCK_ID,
      ...rest,
    };

    const migrationTable =
      options.schema?.migrationTable ?? migrationTableSchemaComponent;

    const coreMigrations = migrationTable.migrations;

    const result: RunSQLMigrationsResult = { applied: [], skipped: [] };

    await databaseLock.withAcquire(
      execute,
      async () => {
        for (const migration of coreMigrations) {
          await execute.batchCommand(migration.sqls);
        }

        for (const migration of migrations) {
          const wasApplied = await runSQLMigration(
            databaseType,
            execute,
            migration,
            {
              ignoreMigrationHashMismatch:
                options.ignoreMigrationHashMismatch ?? false,
            },
          );
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
  databaseType: DatabaseType,
  execute: SQLExecutor,
  migration: SQLMigration,
  options?: { ignoreMigrationHashMismatch?: boolean },
): Promise<boolean> => {
  const sqls = combineMigrations(migration);
  const sqlHash = await getMigrationHash(migration, getFormatter(databaseType));

  try {
    const newMigration = {
      name: migration.name,
      sqlHash,
    };

    const checkResult = await ensureMigrationWasNotAppliedYet(
      execute,
      newMigration,
    );

    if (checkResult.exists === true) {
      if (checkResult.hashesMatch === true) {
        tracer.info('migration-already-applied', {
          migrationName: migration.name,
        });
        return false;
      }
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

    await execute.batchCommand(sqls);

    await recordMigration(execute, newMigration);
    return true;
    // console.log(`Migration "${newMigration.name}" applied successfully.`);
  } catch (error) {
    tracer.error('migration-error', {
      migationName: migration.name,
      error: error,
    });
    throw error;
  }
};

const getMigrationHash = async (
  sqlMigration: SQLMigration,
  sqlFormatter: SQLFormatter,
): Promise<string> => {
  const content = sqlFormatter.describe(sqlMigration.sqls, {
    serializer: JSONSerializer,
  });

  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
};

export const combineMigrations = (
  ...migration: Pick<SQLMigration, 'sqls'>[]
): SQL[] => migration.flatMap((m) => m.sqls);

type EnsureMigrationResult =
  | { exists: false }
  | { exists: true; hashesMatch: true }
  | { exists: true; hashesMatch: false; hashFromDB: string };

const ensureMigrationWasNotAppliedYet = async (
  execute: SQLExecutor,
  migration: { name: string; sqlHash: string },
): Promise<EnsureMigrationResult> => {
  const result = await singleOrNull(
    execute.query<{ sqlHash: string }>(
      SQL`SELECT sql_hash as "sqlHash" FROM dmb_migrations WHERE name = ${migration.name}`,
    ),
  );

  if (result === null) return { exists: false };

  const { sqlHash } = result;

  return {
    exists: true,
    hashesMatch: sqlHash === migration.sqlHash,
    hashFromDB: sqlHash,
  };
};

const recordMigration = async (
  execute: SQLExecutor,
  migration: { name: string; sqlHash: string },
): Promise<void> => {
  await execute.command(
    SQL`
      INSERT INTO dmb_migrations (name, sql_hash)
      VALUES (${migration.name}, ${migration.sqlHash})`,
  );
};

const updateMigrationHash = async (
  execute: SQLExecutor,
  migration: { name: string; sqlHash: string },
): Promise<void> => {
  await execute.command(
    SQL`
      UPDATE dmb_migrations
      SET sql_hash = ${migration.sqlHash}, timestamp = ${new Date()}
      WHERE name = ${migration.name}
      `,
  );
};
