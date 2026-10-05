import { type Dumbo, JSONSerializer } from '../..';
import { fromDatabaseDriverType } from '../../drivers';
import { describeSQL, getFormatter, SQL } from '../../sql';
import type { AnySchemaComponent } from '../schemaComponent';
import type { SQLMigration } from '../sqlMigration';
import { migrationTableComponentFor } from './migrationTableComponent';
import {
  getDefaultMigratorOptionsFromRegistry,
  getMigrationHash,
  type MigratorOptions,
  rendersNothing,
  runSQLMigrations,
  type RunSQLMigrationsResult,
} from './migrator';

export type SchemaComponentMigratorOptions<
  Component extends AnySchemaComponent = AnySchemaComponent,
> = MigratorOptions & {
  pool: Dumbo;
  component: Component;
};

export type SchemaComponentMigrator<
  Component extends AnySchemaComponent = AnySchemaComponent,
> = Readonly<{
  component: Component;
  sql(): string;
  print(): void;
  migrate(
    options?: Pick<
      MigratorOptions,
      | 'execute'
      | 'dryRun'
      | 'ignoreMigrationHashMismatch'
      | 'migrationTimeoutMS'
    >,
  ): Promise<RunSQLMigrationsResult>;
  ensureMigrated(
    options?: Pick<
      MigratorOptions,
      'dryRun' | 'ignoreMigrationHashMismatch' | 'migrationTimeoutMS'
    >,
  ): Promise<void>;
}>;

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

export const schemaComponentMigrator = <Component extends AnySchemaComponent>(
  options: SchemaComponentMigratorOptions<Component>,
): SchemaComponentMigrator<Component> => {
  const { pool, component, ...configured } = options;
  const databaseType = fromDatabaseDriverType(pool.driverType).databaseType;
  let migrated = false;

  const optionsFor = (
    overrides?: Pick<
      MigratorOptions,
      | 'execute'
      | 'dryRun'
      | 'ignoreMigrationHashMismatch'
      | 'migrationTimeoutMS'
    >,
  ): MigratorOptions => ({
    ...configured,
    ...Object.fromEntries(
      Object.entries(overrides ?? {}).filter(
        ([, value]) => value !== undefined,
      ),
    ),
  });

  const sql = (): string =>
    describeSQL(
      component.migrations().flatMap(({ sqls }) => sqls),
      getFormatter(databaseType),
      JSONSerializer,
    );

  const pendingMigrations = async ({
    execute = pool.execute,
    migrationTable,
    ignoreMigrationHashMismatch,
    migrationTimeoutMS,
  }: MigratorOptions): Promise<SQLMigration[]> => {
    const { migrationTableExists } =
      getDefaultMigratorOptionsFromRegistry(databaseType);
    const formatter = getFormatter(databaseType);
    const table = migrationTableComponentFor(migrationTable).fullName;
    const queryOptions = { timeoutMS: migrationTimeoutMS };

    const history = new Map<string, string>();
    if (await migrationTableExists?.(execute, table, queryOptions)) {
      const result = await execute.query<{ name: string; sqlHash: string }>(
        SQL`SELECT name, sql_hash AS "sqlHash" FROM ${table}`,
        queryOptions,
      );
      for (const { name, sqlHash } of result.rows) history.set(name, sqlHash);
    }

    const pending: SQLMigration[] = [];
    for (const migration of component.migrations()) {
      const sqls = migration.sqls.filter(
        (statement) => !rendersNothing(statement, formatter),
      );
      if (sqls.length === 0) continue;
      const recorded = history.get(migration.name);
      if (
        recorded === undefined ||
        (!ignoreMigrationHashMismatch &&
          !migration.ignoreHashMismatch &&
          recorded !== (await getMigrationHash(sqls, formatter)))
      )
        pending.push(migration);
    }
    return pending;
  };

  const ensureMigrated = async (
    overrides?: Pick<
      MigratorOptions,
      'dryRun' | 'ignoreMigrationHashMismatch' | 'migrationTimeoutMS'
    >,
  ): Promise<void> => {
    if (migrated) return;
    const pending = await pendingMigrations(optionsFor(overrides));
    if (pending.length) throw new PendingMigrationsError(pending);
    migrated = true;
  };

  const migrate = async (
    overrides: Pick<
      MigratorOptions,
      | 'execute'
      | 'dryRun'
      | 'ignoreMigrationHashMismatch'
      | 'migrationTimeoutMS'
    > = {},
  ): Promise<RunSQLMigrationsResult> => {
    const migrations = component.migrations();
    const { execute, ...migrationOptions } = optionsFor(overrides);
    const inCallerTransaction = overrides.execute !== undefined;

    const pending = migrated
      ? []
      : await pendingMigrations({ ...migrationOptions, execute });
    if (pending.length === 0) {
      if (!inCallerTransaction) migrated = true;
      return { applied: [], skipped: [...migrations] };
    }

    const result = await runSQLMigrations(
      pool,
      migrations,
      migrationOptions.dryRun
        ? migrationOptions
        : { ...migrationOptions, execute },
    );
    if (!migrationOptions.dryRun && !inCallerTransaction) migrated = true;
    return result;
  };

  return Object.freeze({
    component,
    sql,
    print: () => {
      console.log(sql());
    },
    migrate,
    ensureMigrated,
  });
};
