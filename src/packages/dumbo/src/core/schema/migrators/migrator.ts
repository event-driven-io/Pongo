import { type Dumbo, JSONSerializer } from '../..';
import { type DatabaseType, fromDatabaseDriverType } from '../../drivers';
import type { SQLExecutor } from '../../execute';
import {
  type DatabaseLock,
  type DatabaseLockOptions,
  NoDatabaseLock,
} from '../../locks';
import { singleOrNull } from '../../query';
import type { SQLFormatter } from '../../sql';
import { SQL, getFormatter } from '../../sql';
import { tracer } from '../../tracing';
import type { SQLMigration } from '../sqlMigration';
import { migrationTableComponentFor } from './migrationTableComponent';

const MIGRATIONS_LOCK_ID = 999956789;

const maxMigrationNameLength = 255;

declare global {
  var defaultMigratorOptions: Record<DatabaseType, MigratorOptions>;
}

const defaultMigratorOptions = (globalThis.defaultMigratorOptions =
  globalThis.defaultMigratorOptions ?? {});

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

export type MigrationTableOptions = {
  schemaName?: string | undefined;
  tableName?: string | undefined;
};

export type MigratorOptions = {
  migrationTable?: MigrationTableOptions | undefined;
  lock?: {
    databaseLock?: DatabaseLock;
    options?: Omit<DatabaseLockOptions, 'lockId'> &
      Partial<Pick<DatabaseLockOptions, 'lockId'>>;
  };
  dryRun?: boolean | undefined;
  ignoreMigrationHashMismatch?: boolean | undefined;
  migrationTimeoutMs?: number | undefined;
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
    for (const migration of migrations) {
      if (migration.name.length > maxMigrationNameLength)
        throw new Error(
          `Migration name "${migration.name}" is ${migration.name.length} characters long, exceeding the maximum of ${maxMigrationNameLength} characters.`,
        );
    }

    const databaseType = fromDatabaseDriverType(pool.driverType).databaseType;
    const defaultOptions = getDefaultMigratorOptionsFromRegistry(databaseType);
    partialOptions ??= {};

    const options: MigratorOptions = {
      ...defaultOptions,
      ...partialOptions,
      migrationTable:
        partialOptions?.migrationTable ?? defaultOptions.migrationTable,
      lock: {
        ...defaultOptions.lock,
        ...partialOptions?.lock,
        options: {
          lockId: MIGRATIONS_LOCK_ID,
          ...defaultOptions.lock?.options,
          ...partialOptions?.lock?.options,
        },
      },
      dryRun: partialOptions?.dryRun ?? defaultOptions.dryRun,
      ignoreMigrationHashMismatch:
        partialOptions?.ignoreMigrationHashMismatch ??
        defaultOptions.ignoreMigrationHashMismatch,
      migrationTimeoutMs:
        partialOptions?.migrationTimeoutMs ?? defaultOptions.migrationTimeoutMs,
    };

    const databaseLock = options.lock?.databaseLock ?? NoDatabaseLock;

    const lockOptions: DatabaseLockOptions = {
      lockId: MIGRATIONS_LOCK_ID,
      ...options.lock?.options,
    };

    const migrationTableOptions = options.migrationTable;
    const schemaName = migrationTableOptions?.schemaName;

    if (
      databaseType === 'SQLite' &&
      schemaName !== undefined &&
      schemaName !== 'main'
    ) {
      throw new Error(
        'SQLite does not support schema-qualified migration tables',
      );
    }

    const tableName = migrationTableOptions?.tableName ?? 'dmb_migrations';
    const migrationTableReference =
      databaseType === 'PostgreSQL' && schemaName
        ? SQL`${SQL.identifier(schemaName)}.${SQL.identifier(tableName)}`
        : SQL`${SQL.identifier(tableName)}`;
    const coreMigrations = migrationTableComponentFor({
      schemaName: databaseType === 'PostgreSQL' ? schemaName : undefined,
      tableName,
    }).migrations();

    const result: RunSQLMigrationsResult = { applied: [], skipped: [] };

    await databaseLock.withAcquire(
      execute,
      async () => {
        for (const migration of coreMigrations) {
          await execute.batchCommand(migration.sqls, {
            timeoutMs: options.migrationTimeoutMs,
          });
        }

        for (const migration of migrations) {
          const wasApplied = await runSQLMigration(
            databaseType,
            execute,
            migration,
            migrationTableReference,
            {
              ignoreMigrationHashMismatch:
                options.ignoreMigrationHashMismatch ?? false,
              migrationTimeoutMs: options.migrationTimeoutMs,
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

const rendersNothing = (sql: SQL, formatter: SQLFormatter): boolean =>
  formatter.format(sql, { serializer: JSONSerializer }).query.trim().length ===
  0;

const runSQLMigration = async (
  databaseType: DatabaseType,
  execute: SQLExecutor,
  migration: SQLMigration,
  migrationTableReference: SQL,
  options?: {
    ignoreMigrationHashMismatch?: boolean;
    migrationTimeoutMs?: number | undefined;
  },
): Promise<boolean> => {
  const formatter = getFormatter(databaseType);
  const sqls = combineMigrations(migration).filter(
    (sql) => !rendersNothing(sql, formatter),
  );

  if (sqls.length === 0) return false;

  const sqlHash = await getMigrationHash(sqls, formatter);

  try {
    const newMigration = {
      name: migration.name,
      sqlHash,
    };

    const checkResult = await ensureMigrationWasNotAppliedYet(
      execute,
      newMigration,
      migrationTableReference,
    );

    if (checkResult.exists === true) {
      if (checkResult.hashesMatch === true) {
        tracer.info('migration-already-applied', {
          migrationName: migration.name,
        });
        return false;
      }
      if (
        migration.ignoreHashMismatch !== true &&
        options?.ignoreMigrationHashMismatch !== true
      )
        throw new Error(
          `Migration hash mismatch for "${migration.name}". Aborting migration.`,
        );

      tracer.warn('migration-hash-mismatch', {
        migrationName: migration.name,
        expectedHash: sqlHash,
        actualHash: checkResult.hashFromDB,
      });

      if (migration.ignoreHashMismatch === true) return false;

      await updateMigrationHash(execute, newMigration, migrationTableReference);

      return false;
    }

    await execute.batchCommand(sqls, {
      timeoutMs: options?.migrationTimeoutMs,
    });

    await recordMigration(execute, newMigration, migrationTableReference);
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
  sqls: SQL[],
  sqlFormatter: SQLFormatter,
): Promise<string> => {
  const content = sqlFormatter.describe(sqls, {
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
  migrationTableReference: SQL,
): Promise<EnsureMigrationResult> => {
  const result = await singleOrNull(
    execute.query<{ sqlHash: string }>(
      SQL`SELECT sql_hash as "sqlHash" FROM ${migrationTableReference} WHERE name = ${migration.name}`,
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
  migrationTableReference: SQL,
): Promise<void> => {
  await execute.command(
    SQL`
      INSERT INTO ${migrationTableReference} (name, sql_hash)
      VALUES (${migration.name}, ${migration.sqlHash})`,
  );
};

const updateMigrationHash = async (
  execute: SQLExecutor,
  migration: { name: string; sqlHash: string },
  migrationTableReference: SQL,
): Promise<void> => {
  await execute.command(
    SQL`
      UPDATE ${migrationTableReference}
      SET sql_hash = ${migration.sqlHash}, timestamp = ${new Date()}
      WHERE name = ${migration.name}
      `,
  );
};
