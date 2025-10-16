import type { DatabaseDriverType, Dumbo } from '..';
import {
  runSQLMigrations,
  type MigratorOptions,
  type SQLMigration,
} from './migrations';

export type SchemaComponent<ComponentType extends string = string> = {
  schemaComponentType: ComponentType;
  components: ReadonlyArray<SchemaComponent>;
  migrations: ReadonlyArray<SQLMigration>;
};

export type SchemaComponentOptions =
  | {
      migrations: ReadonlyArray<SQLMigration>;
      components?: never;
    }
  | {
      migrations: ReadonlyArray<SQLMigration>;
      components: ReadonlyArray<SchemaComponent>;
    }
  | {
      migrations?: never;
      components: ReadonlyArray<SchemaComponent>;
    };

export const schemaComponent = <ComponentType extends string = string>(
  type: ComponentType,
  migrationsOrComponents: SchemaComponentOptions,
): SchemaComponent<ComponentType> => {
  const components = migrationsOrComponents.components ?? [];
  const migrations = migrationsOrComponents.migrations ?? [];

  return {
    schemaComponentType: type,
    components,
    get migrations(): SQLMigration[] {
      return [...migrations, ...components.flatMap((c) => c.migrations)];
    },
  };
};

export type DatabaseSchemaComponent<Kind extends string = 'regular'> =
  SchemaComponent<`sc:dumbo:database:${Kind}`> & {
    databaseName: string;
    schemas: ReadonlyArray<DatabaseSchemaSchemaComponent>;
  };

export const databaseSchemaComponent = <Kind extends string = 'regular'>({
  kind,
  databaseName,
  schemas,
  ...migrationsOrComponents
}: {
  kind?: Kind;
  databaseName: string;
  schemas: ReadonlyArray<DatabaseSchemaSchemaComponent>;
} & SchemaComponentOptions): DatabaseSchemaComponent<Kind> => {
  const component = schemaComponent<`sc:dumbo:database:${Kind}`>(
    `sc:dumbo:database:${(kind ?? 'regular') as Kind}`,
    migrationsOrComponents,
  );

  return {
    ...component,
    databaseName,
    get schemas() {
      return schemas;
    },
  };
};

export type DatabaseSchemaSchemaComponent<Kind extends string = 'regular'> =
  SchemaComponent<`sc:dumbo:database_schema:${Kind}`> & {
    schemaName: string;
    tables: ReadonlyMap<string, TableSchemaComponent>;
  };

export type TableSchemaComponent<Kind extends string = 'regular'> =
  SchemaComponent<`sc:dumbo:table:${Kind}`> & {
    tableName: string;
    columns: ReadonlyMap<string, ColumnSchemaComponent>;
    indexes: ReadonlyMap<string, IndexSchemaComponent>;
  };

export type ColumnSchemaComponent<Kind extends string = 'regular'> =
  SchemaComponent<`sc:dumbo:column:${Kind}`> & {
    columnName: string;
  };

export type IndexSchemaComponent<Kind extends string = 'regular'> =
  SchemaComponent<`sc:dumbo:index:${Kind}`> & {
    indexName: string;
    columns: ReadonlyMap<string, ColumnSchemaComponent>;
    unique: boolean;
  };

export type SchemaComponentMigrator = {
  component: SchemaComponent;
  run: (options?: Partial<MigratorOptions>) => Promise<void>;
};

export const SchemaComponentMigrator = <DriverType extends DatabaseDriverType>(
  component: SchemaComponent,
  dumbo: Dumbo,
): SchemaComponentMigrator => {
  const completedMigrations: string[] = [];

  return {
    component,
    run: async (options) => {
      //TODO: name is not the safest choice here, so we might want to add an id or hash instead
      const pendingMigrations = component.migrations.filter(
        (m) => !completedMigrations.includes(m.name),
      );

      if (pendingMigrations.length === 0) return;

      await runSQLMigrations(dumbo, pendingMigrations, options);

      completedMigrations.push(...pendingMigrations.map((m) => m.name));
    },
  };
};
