import type { Dumbo } from '..';
import { type DatabaseType, fromConnectorType } from '../connectors';
import type { SQLExecutor } from '../execute';
import {
  type DatabaseLock,
  type DatabaseLockOptions,
  NoDatabaseLock,
} from '../locks';
import { mapToCamelCase, singleOrNull } from '../query';
import { SQL, type SQLFormatter } from '../sql';
import { tracer } from '../tracing';
import { schemaComponent, type SchemaComponent } from './schemaComponent';

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

const { AutoIncrement, Varchar, Timestamp } = SQL.column.type;

const migrationTableSQL = SQL`
  CREATE TABLE IF NOT EXISTS migrations (
    id ${AutoIncrement({ primaryKey: true })},
    name ${Varchar(255)} NOT NULL UNIQUE,
    application ${Varchar(255)} NOT NULL DEFAULT 'default',
    sql_hash ${Varchar(64)} NOT NULL,
    timestamp ${Timestamp} NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`;

export const migrationTableSchemaComponent = schemaComponent(
  'dumbo:schema-component:migrations-table',
  {
    migrations: [sqlMigration('dumbo:migrationTable:001', [migrationTableSQL])],
  },
);

const defaultMigratorOptions: Record<DatabaseType, MigratorOptions> =
  {} as Record<DatabaseType, MigratorOptions>;

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
};

export const runSQLMigrations = (
  pool: Dumbo,
  migrations: ReadonlyArray<SQLMigration>,
  partialOptions?: Partial<MigratorOptions>,
): Promise<void> =>
  pool.withTransaction(async ({ execute }) => {
    const databaseType = fromConnectorType(pool.connector).databaseType;
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
    };

    const { databaseLock: _, ...rest } = options.lock ?? {};

    const databaseLock = options.lock?.databaseLock ?? NoDatabaseLock;

    const lockOptions: DatabaseLockOptions = {
      lockId: MIGRATIONS_LOCK_ID,
      ...rest,
    };

    const migrationTable =
      options.schema?.migrationTable ?? migrationTableSchemaComponent;

    const coreMigrations = await migrationTable.resolveMigrations({
      databaseType,
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
  const content = sqlFormatter.describe(sqlMigration.sqls);

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
