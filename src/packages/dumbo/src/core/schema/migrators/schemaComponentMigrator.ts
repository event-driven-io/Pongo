import { type Dumbo, JSONSerializer } from '../..';
import { fromDatabaseDriverType } from '../../drivers';
import { describeSQL, getFormatter } from '../../sql';
import type { AnySchemaComponent } from '../schemaComponent';
import {
  ensureSQLMigrations,
  type MigrationHashMismatchOptions,
  type MigratorOptions,
  runSQLMigrations,
  type RunSQLMigrationsResult,
} from './migrator';

export type SchemaComponentMigratorOptions<
  Component extends AnySchemaComponent = AnySchemaComponent,
> = MigratorOptions & {
  pool: Dumbo;
  component: Component;
};

export type SchemaComponentMigrateOptions = Pick<
  MigratorOptions,
  'execute' | 'dryRun' | 'migrationTimeoutMS'
> &
  MigrationHashMismatchOptions;

export type SchemaComponentMigrator<
  Component extends AnySchemaComponent = AnySchemaComponent,
> = Readonly<{
  component: Component;
  sql(): string;
  print(): void;
  migrate(
    options?: SchemaComponentMigrateOptions,
  ): Promise<RunSQLMigrationsResult>;
  ensureMigrated(
    options?: Pick<
      MigratorOptions,
      'dryRun' | 'ignoreMigrationHashMismatch' | 'migrationTimeoutMS'
    >,
  ): Promise<void>;
}>;

export const schemaComponentMigrator = <Component extends AnySchemaComponent>(
  options: SchemaComponentMigratorOptions<Component>,
): SchemaComponentMigrator<Component> => {
  const { pool, component, ...configured } = options;
  const databaseType = fromDatabaseDriverType(pool.driverType).databaseType;
  let migrated = false;

  const optionsFor = (
    overrides?: SchemaComponentMigrateOptions,
  ): Partial<MigratorOptions> & MigrationHashMismatchOptions => ({
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

  const ensureMigrated = async (
    overrides?: Pick<
      MigratorOptions,
      'dryRun' | 'ignoreMigrationHashMismatch' | 'migrationTimeoutMS'
    >,
  ): Promise<void> => {
    if (migrated) return;
    await ensureSQLMigrations(
      pool,
      component.migrations(),
      optionsFor(overrides),
    );
    migrated = true;
  };

  const migrate = async (
    overrides: SchemaComponentMigrateOptions = {},
  ): Promise<RunSQLMigrationsResult> => {
    const migrations = component.migrations();
    if (migrated) return { applied: [], skipped: [...migrations] };

    const migrationOptions = optionsFor(overrides);

    const result = await runSQLMigrations(pool, migrations, migrationOptions);
    if (!migrationOptions.dryRun && overrides.execute === undefined)
      migrated = true;
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
