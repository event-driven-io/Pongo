import { type Dumbo, JSONSerializer } from '../..';
import type { DatabaseTransactionOptions } from '../../connections';
import {
  type DatabaseDriverType,
  type DatabaseType,
  fromDatabaseDriverType,
} from '../../drivers';
import { InvalidOperationError, NotRegisteredError } from '../../errors';
import type { SQLExecutor } from '../../execute';
import {
  type DatabaseLock,
  type DatabaseLockOptions,
  NoDatabaseLock,
} from '../../locks';
import type { SQLFormatter, SQLTableReference } from '../../sql';
import { SQL, getFormatter } from '../../sql';
import { tracer } from '../../tracing';
import { getDatabaseMetadata } from '../databaseMetadata/databaseMetadata';
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
    throw new NotRegisteredError(
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
  execute?: SQLExecutor | undefined;
  lock?: {
    databaseLock?: DatabaseLock;
    options?: Omit<DatabaseLockOptions, 'lockId'> &
      Partial<Pick<DatabaseLockOptions, 'lockId'>>;
  };
  transactionOptions?: DatabaseTransactionOptions | undefined;
  dryRun?: boolean | undefined;
  ignoreMigrationHashMismatch?: boolean | undefined;
  migrationTimeoutMS?: number | undefined;
};

export type RunSQLMigrationsResult = {
  applied: SQLMigration[];
  skipped: SQLMigration[];
};

export class PendingMigrationsError extends Error {
  readonly pendingMigrations: ReadonlyArray<SQLMigration>;
  constructor(pendingMigrations: ReadonlyArray<SQLMigration>) {
    super(
      `Pending migrations: ${pendingMigrations.map(({ name }) => name).join(', ')}`,
    );
    this.name = 'PendingMigrationsError';
    this.pendingMigrations = Object.freeze([...pendingMigrations]);
  }
}

export const ensureSQLMigrations = async (
  pool: Dumbo,
  migrations: ReadonlyArray<SQLMigration>,
  partialOptions?: Partial<MigratorOptions>,
): Promise<void> => {
  const options = migratorOptionsFor(pool.driverType, partialOptions);
  const pending = await pendingSQLMigrations(
    pool.driverType,
    options.execute ?? pool.execute,
    migrations,
    options,
  );
  if (pending.length)
    throw new PendingMigrationsError(pending.map(({ migration }) => migration));
};

export const runSQLMigrations = async (
  pool: Dumbo,
  migrations: ReadonlyArray<SQLMigration>,
  partialOptions?: Partial<MigratorOptions>,
): Promise<RunSQLMigrationsResult> => {
  const options = migratorOptionsFor(pool.driverType, partialOptions);
  const pending = await pendingSQLMigrations(
    pool.driverType,
    options.execute ?? pool.execute,
    migrations,
    options,
  );
  const applied = pending.map(({ migration }) => migration);
  const result = {
    applied,
    skipped: migrations.filter((migration) => !applied.includes(migration)),
  };

  if (pending.length === 0) return result;

  if (options.execute) {
    await applySQLMigrations(
      pool.driverType,
      options.execute,
      pending,
      options,
    );
    return result;
  }

  return pool.withTransaction(async ({ execute }) => {
    await applySQLMigrations(pool.driverType, execute, pending, options);
    return { success: !options.dryRun, result };
  }, options.transactionOptions);
};

const migratorOptionsFor = (
  driverType: DatabaseDriverType,
  partialOptions: Partial<MigratorOptions> = {},
): MigratorOptions => {
  const databaseType = fromDatabaseDriverType(driverType).databaseType;
  const defaultOptions = getDefaultMigratorOptionsFromRegistry(databaseType);

  return {
    ...defaultOptions,
    ...partialOptions,
    migrationTable:
      partialOptions.migrationTable ?? defaultOptions.migrationTable,
    lock: {
      ...defaultOptions.lock,
      ...partialOptions.lock,
      options: {
        ...defaultOptions.lock?.options,
        ...partialOptions.lock?.options,
      },
    },
    dryRun: partialOptions.dryRun ?? defaultOptions.dryRun,
    ignoreMigrationHashMismatch:
      partialOptions.ignoreMigrationHashMismatch ??
      defaultOptions.ignoreMigrationHashMismatch,
    migrationTimeoutMS:
      partialOptions.migrationTimeoutMS ?? defaultOptions.migrationTimeoutMS,
  };
};

const applySQLMigrations = async (
  driverType: DatabaseDriverType,
  execute: SQLExecutor,
  pending: { migration: SQLMigration; sqls: SQL[]; sqlHash: string }[],
  options: MigratorOptions,
): Promise<void> => {
  for (const { migration } of pending) {
    if (migration.name.length > maxMigrationNameLength)
      throw new InvalidOperationError(
        `Migration name "${migration.name}" is ${migration.name.length} characters long, exceeding the maximum of ${maxMigrationNameLength} characters.`,
      );
  }

  const databaseType = fromDatabaseDriverType(driverType).databaseType;

  const databaseLock = options.lock?.databaseLock ?? NoDatabaseLock;

  const lockOptions: DatabaseLockOptions = {
    lockId: MIGRATIONS_LOCK_ID,
    ...options.lock?.options,
  };

  const migrationTable = migrationTableComponentFor(options.migrationTable);
  const migrationTableReference = migrationTable.fullName;
  const coreMigrations = migrationTable.migrations();

  await databaseLock.withAcquire(
    execute,
    async () => {
      const formatter = getFormatter(databaseType);
      for (const migration of coreMigrations) {
        const sqls = migration.sqls.filter(
          (sql) => !rendersNothing(sql, formatter),
        );
        if (sqls.length === 0) continue;

        await execute.batchCommand(sqls, {
          timeoutMS: options.migrationTimeoutMS,
        });
      }

      for (const { migration, sqlHash, sqls } of pending) {
        const newMigration = {
          name: migration.name,
          sqlHash,
        };
        try {
          await execute.batchCommand(
            [
              recordMigrationSQL(newMigration, migrationTableReference),
              ...sqls,
            ],
            { timeoutMS: options.migrationTimeoutMS },
          );
          tracer.info('migration-applied', {
            migrationName: migration.name,
          });
        } catch (error) {
          tracer.error('migration-error', {
            migationName: migration.name,
            error: error,
          });
          throw error;
        }
      }
    },
    lockOptions,
  );
};

export const rendersNothing = (sql: SQL, formatter: SQLFormatter): boolean =>
  formatter.format(sql, { serializer: JSONSerializer }).query.trim().length ===
  0;

export const getMigrationHash = async (
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

const pendingSQLMigrations = async (
  driverType: DatabaseDriverType,
  execute: SQLExecutor,
  migrations: ReadonlyArray<SQLMigration>,
  options: MigratorOptions,
) => {
  const databaseType = fromDatabaseDriverType(driverType).databaseType;
  const metadata = getDatabaseMetadata(driverType);
  if (!metadata)
    throw new NotRegisteredError(
      `No database metadata registered for database type: ${databaseType}`,
    );

  const migrationTable = migrationTableComponentFor(
    options.migrationTable,
  ).fullName;
  const migrationTableExists = await metadata.tableExists(
    execute,
    migrationTable.tableName,
    {
      timeoutMS: options.migrationTimeoutMS,
      databaseSchemaName: options.migrationTable?.schemaName,
    },
  );
  const history = new Map<string, string>();
  if (migrationTableExists) {
    const { rows } = await execute.query<{ name: string; sqlHash: string }>(
      SQL`SELECT name, sql_hash AS "sqlHash" FROM ${migrationTable}`,
      { timeoutMS: options.migrationTimeoutMS },
    );
    for (const { name, sqlHash } of rows) history.set(name, sqlHash);
  }

  const formatter = getFormatter(databaseType);

  const pending: { migration: SQLMigration; sqls: SQL[]; sqlHash: string }[] =
    [];
  for (const migration of migrations) {
    const sqls = combineMigrations(migration).filter(
      (sql) => !rendersNothing(sql, formatter),
    );
    if (sqls.length === 0) continue;

    const sqlHash = await getMigrationHash(sqls, formatter);
    const recordedHash = history.get(migration.name);

    if (recordedHash === undefined) {
      pending.push({ migration, sqls, sqlHash });
      continue;
    }

    if (recordedHash === sqlHash) {
      tracer.info('migration-already-applied', {
        migrationName: migration.name,
      });
      continue;
    }

    if (
      migration.ignoreHashMismatch !== true &&
      options.ignoreMigrationHashMismatch !== true
    ) {
      const error = new InvalidOperationError(
        `Migration hash mismatch for "${migration.name}". Aborting migration.`,
      );
      tracer.error('migration-error', {
        migationName: migration.name,
        error: error,
      });
      throw error;
    }

    tracer.warn('migration-hash-mismatch', {
      migrationName: migration.name,
      expectedHash: sqlHash,
      actualHash: recordedHash,
    });
  }
  return pending;
};

const recordMigrationSQL = (
  migration: { name: string; sqlHash: string },
  migrationTableReference: SQLTableReference,
): SQL =>
  SQL`
      INSERT INTO ${migrationTableReference} (name, sql_hash)
      VALUES (${migration.name}, ${migration.sqlHash})`;
