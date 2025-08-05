import {
  mapToCamelCase,
  singleOrNull,
  SQL,
  tracer,
  type SchemaComponent,
  type SQLExecutor,
  type SQLFormatter,
} from '..';
import { type DatabaseLock, type DatabaseLockOptions, type Dumbo } from '../..';

export type MigrationStyle = 'None' | 'CreateOrUpdate';

export type SQLMigration = {
  name: string;
  sqls: SQL[];
};

export const sqlMigration = (name: string, sqls: SQL[]): SQLMigration => ({
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
};

export const runSQLMigrations = (
  pool: Dumbo,
  migrations: ReadonlyArray<SQLMigration>,
  options: MigratorOptions,
): Promise<void> =>
  pool.withTransaction(async ({ execute }) => {
    const { databaseLock, ...rest } = options.lock;

    const lockOptions: DatabaseLockOptions = {
      lockId: MIGRATIONS_LOCK_ID,
      ...rest,
    };

    const coreMigrations = options.schema.migrationTable.migrations({
      connector: 'PostgreSQL:pg', // TODO: This will need to change to support more connectors
    });

    await databaseLock.withAcquire(
      execute,
      async () => {
        for (const migration of coreMigrations) {
          await execute.batchCommand(migration.sqls);
        }

        for (const migration of migrations) {
          await runSQLMigration(execute, migration);
        }
      },
      lockOptions,
    );

    return { success: options.dryRun ? false : true, result: undefined };
  });

const runSQLMigration = async (
  execute: SQLExecutor,
  migration: SQLMigration,
): Promise<void> => {
  const sqls = combineMigrations(migration);
  const sqlHash = await getMigrationHash(migration, execute.formatter);

  try {
    const newMigration = {
      name: migration.name,
      sqlHash,
    };

    const wasMigrationApplied = await ensureMigrationWasNotAppliedYet(
      execute,
      newMigration,
    );

    if (wasMigrationApplied) return;

    await execute.batchCommand(sqls);

    await recordMigration(execute, newMigration);
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
  const content = sqlFormatter.format(sqlMigration.sqls);

  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
};

export const combineMigrations = (
  ...migration: Pick<SQLMigration, 'sqls'>[]
): SQL[] => migration.flatMap((m) => m.sqls);

const ensureMigrationWasNotAppliedYet = async (
  execute: SQLExecutor,
  migration: { name: string; sqlHash: string },
): Promise<boolean> => {
  const result = await singleOrNull(
    execute.query<{ sql_hash: string }>(
      SQL`SELECT sql_hash FROM migrations WHERE name = ${migration.name}`,
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
    SQL`
      INSERT INTO migrations (name, sql_hash)
      VALUES (${migration.name}, ${migration.sqlHash})`,
  );
};
