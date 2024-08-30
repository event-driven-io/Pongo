import type { Dumbo, SQL } from '../..';
import {
  combineMigrations,
  runSQLMigrations,
  type Migration,
  type MigratorOptions,
} from './migrations';

export type SchemaComponent = {
  type: string;
  migration: Readonly<Migration>;
  sql: SQL;
  print(): void;
  migrate(pool: Dumbo, options?: MigratorOptions): Promise<void>;
};

export type SchemaComponentGroup = {
  type: string;
  components: ReadonlyArray<SchemaComponent>;
  migrations: ReadonlyArray<Migration>;
  sql: SQL;
  print(): void;
  migrate(pool: Dumbo, options?: MigratorOptions): Promise<void>;
};

export const schemaComponent = <ComponentType extends string = string>(
  type: ComponentType,
  migration: Migration,
): SchemaComponent => {
  return {
    type,
    migration,
    get sql() {
      return combineMigrations(migration);
    },
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
): SchemaComponentGroup => {
  const migrations = components.map((c) => c.migration);

  return {
    type,
    components,
    migrations,
    get sql() {
      return combineMigrations(...migrations);
    },
    print: () => console.log(JSON.stringify(migrations)),
    migrate: (pool: Dumbo, options: MigratorOptions) =>
      runSQLMigrations(pool, migrations, options),
  };
};

export type WithSchemaComponent = {
  schema: SchemaComponent;
};

export type WithSchemaComponentGroup = {
  schema: SchemaComponentGroup;
};
