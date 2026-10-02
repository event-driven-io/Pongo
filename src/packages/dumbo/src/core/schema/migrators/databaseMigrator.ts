import { type Dumbo, JSONSerializer } from '../..';
import { fromDatabaseDriverType } from '../../drivers';
import { describeSQL, getFormatter, SQL } from '../../sql';
import type { AnySchemaComponent } from '../schemaComponent';
import type { MigrationStyle, SQLMigration } from '../sqlMigration';
import { migrationTableComponentFor } from './migrationTableComponent';
import {
  getDefaultMigratorOptionsFromRegistry,
  getMigrationHash,
  type MigratorOptions,
  rendersNothing,
  runSQLMigrations,
  type RunSQLMigrationsResult,
} from './migrator';

export type DatabaseMigratorOptions<
  Component extends AnySchemaComponent = AnySchemaComponent,
> = MigratorOptions & {
  pool: Dumbo;
  component: Component;
  autoMigration?: MigrationStyle | undefined;
};

export type DatabaseMigrator<
  Component extends AnySchemaComponent = AnySchemaComponent,
> = Readonly<{
  component: Component;
  sql(): string;
  print(): void;
  migrate(options?: MigratorOptions): Promise<RunSQLMigrationsResult>;
  ensureMigrated(options?: Omit<MigratorOptions, 'execute'>): Promise<void>;
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

export const databaseMigrator = <Component extends AnySchemaComponent>(
  options: DatabaseMigratorOptions<Component>,
): DatabaseMigrator<Component> => {
  const {
    pool,
    component,
    autoMigration = 'CreateOrUpdate',
    ...configured
  } = options;
  const databaseType = fromDatabaseDriverType(pool.driverType).databaseType;
  let ensured = false;

  const optionsFor = (overrides?: MigratorOptions): MigratorOptions => ({
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

  const migrate = (
    overrides?: MigratorOptions,
  ): Promise<RunSQLMigrationsResult> => {
    const { execute, ...migrationOptions } = optionsFor(overrides);

    return runSQLMigrations(
      pool,
      component.migrations(),
      migrationOptions.dryRun
        ? migrationOptions
        : { ...migrationOptions, execute },
    );
  };

  const checkHistory = async (overrides?: MigratorOptions): Promise<void> => {
    const {
      execute = pool.execute,
      migrationTable,
      ignoreMigrationHashMismatch,
      migrationTimeoutMS,
    } = optionsFor(overrides);
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
    if (pending.length) throw new PendingMigrationsError(pending);
  };

  const ensureMigrated = async (
    overrides?: Omit<MigratorOptions, 'execute'>,
  ): Promise<void> => {
    if (ensured) return;
    await (autoMigration === 'None'
      ? checkHistory(overrides)
      : migrate(overrides));
    if (!optionsFor(overrides).dryRun) ensured = true;
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
