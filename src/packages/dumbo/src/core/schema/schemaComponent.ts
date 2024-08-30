import type { Dumbo } from '../..';
import {
  combineMigrations,
  runSQLMigrations,
  type Migration,
  type MigratorOptions,
} from './migrations';

export type SchemaComponent<ComponentType extends string = string> = {
  type: ComponentType;
  migration: Readonly<Migration>;
  sql(): string;
  print(): void;
  migrate(pool: Dumbo, options: MigratorOptions): Promise<void>;
};

export type SchemaComponentGroup<ComponentTypeGroup extends string = string> = {
  type: ComponentTypeGroup;
  components: ReadonlyArray<SchemaComponent>;
  migrations: ReadonlyArray<Migration>;
  sql(): string;
  print(): void;
  migrate(pool: Dumbo, options: MigratorOptions): Promise<void>;
};

export const schemaComponent = <ComponentType extends string = string>(
  type: ComponentType,
  migration: Migration,
): SchemaComponent<ComponentType> => {
  return {
    type,
    migration,
    sql: () => combineMigrations(migration),
    print: () => console.log(JSON.stringify(migration)),
    migrate: (pool: Dumbo, options: MigratorOptions) =>
      runSQLMigrations(pool, [migration], options),
  };
};

export const schemaComponentGroup = <
  ComponentTypeGroup extends string = string,
>(
  type: ComponentTypeGroup,
  components: SchemaComponent[],
): SchemaComponentGroup<ComponentTypeGroup> => {
  const migrations = components.map((c) => c.migration);

  return {
    type,
    components,
    migrations,
    sql: () => combineMigrations(...migrations),
    print: () => console.log(JSON.stringify(migrations)),
    migrate: (pool: Dumbo, options: MigratorOptions) =>
      runSQLMigrations(pool, migrations, options),
  };
};
