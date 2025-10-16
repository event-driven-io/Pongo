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

export type DatabaseSchemaSchemaComponent<
  ComponentType extends string = string,
> = SchemaComponent<ComponentType> & {
  schemaName: string;
  tables: ReadonlyArray<TableSchemaComponent>;
};

export type TableSchemaComponent<ComponentType extends string = string> =
  SchemaComponent<ComponentType> & {
    tableName: string;
    columns: ReadonlyArray<ColumnSchemaComponent>;
    indexes: ReadonlyArray<IndexSchemaComponent>;
  };

export type ColumnSchemaComponent<ComponentType extends string = string> =
  SchemaComponent<ComponentType> & {
    columnName: string;
  };

export type IndexSchemaComponent<ComponentType extends string = string> =
  SchemaComponent<ComponentType> & {
    indexName: string;
    columns: ReadonlyArray<string>;
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
