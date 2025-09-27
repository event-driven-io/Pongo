import { type SQLMigration } from './migrations';

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

export type DatabaseSchemaComponent<ComponentType extends string = string> =
  SchemaComponent<ComponentType>;

export type DatabaseSchemaSchemaComponent<
  ComponentType extends string = string,
> = SchemaComponent<ComponentType>;

export type TableSchemaComponent<ComponentType extends string = string> =
  SchemaComponent<ComponentType>;

export type ColumnSchemaComponent<ComponentType extends string = string> =
  SchemaComponent<ComponentType>;

export type IndexSchemaComponent<ComponentType extends string = string> =
  SchemaComponent<ComponentType>;
