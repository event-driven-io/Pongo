import type { ExtensionComponent } from '../extensionComponent';
import {
  createSchemaComponent,
  schemaComponentMap,
  schemaComponentType,
  type AnySchemaComponent,
  type SchemaComponent,
  type SchemaComponentOptions,
} from '../schemaComponent';
import type { AnyTableComponent } from './tableComponent';

export const databaseSchemaComponentType: unique symbol = Symbol(
  'dumbo.schemaComponent.databaseSchema',
);

export type DatabaseSchemaTables = Readonly<Record<string, AnyTableComponent>>;
export type SchemaExtensions = Readonly<Record<string, ExtensionComponent>>;

export type DatabaseSchemaComponent<
  Tables extends DatabaseSchemaTables = DatabaseSchemaTables,
  SchemaName extends string | undefined = string | undefined,
  Extensions extends SchemaExtensions = SchemaExtensions,
> = SchemaComponent<typeof databaseSchemaComponentType> &
  Readonly<{
    schemaName: SchemaName;
    tables: Tables;
    extensions: Extensions;
  }>;

export type AnyDatabaseSchemaComponent = DatabaseSchemaComponent<
  DatabaseSchemaTables,
  string | undefined,
  SchemaExtensions
>;

export type DatabaseSchemaComponentOptions<
  Tables extends DatabaseSchemaTables,
  SchemaName extends string | undefined,
  Extensions extends SchemaExtensions,
> = Readonly<{
  schemaName?: SchemaName | undefined;
  tables?: Tables | undefined;
  extensions?: Extensions | undefined;
}> &
  Omit<SchemaComponentOptions, 'components'>;

export const databaseSchemaComponent = <
  const Tables extends DatabaseSchemaTables = DatabaseSchemaTables,
  const SchemaName extends string | undefined = undefined,
  const Extensions extends SchemaExtensions = SchemaExtensions,
>(
  options: DatabaseSchemaComponentOptions<Tables, SchemaName, Extensions>,
): DatabaseSchemaComponent<Tables, SchemaName, Extensions> => {
  const tables = (options.tables ?? {}) as Tables;
  const extensions = (options.extensions ?? {}) as Extensions;
  for (const table of Object.values(tables)) {
    if (
      table.databaseSchemaName !== undefined &&
      options.schemaName !== undefined &&
      table.databaseSchemaName !== options.schemaName
    ) {
      throw new Error(
        `Table "${table.tableName}" is constrained to database schema "${table.databaseSchemaName}" and cannot be placed in "${options.schemaName}"`,
      );
    }
  }
  const base = createSchemaComponent(
    databaseSchemaComponentType,
    {
      components: [...Object.values(tables), ...Object.values(extensions)],
      migrations: options.migrations,
      context: { databaseSchemaName: options.schemaName },
    },
    {
      schemaName: options.schemaName as SchemaName,
      tables: schemaComponentMap(tables),
      extensions: schemaComponentMap(extensions),
    },
  );

  return base;
};

export const isDatabaseSchemaComponent = (
  component: AnySchemaComponent,
): component is AnyDatabaseSchemaComponent =>
  component[schemaComponentType] === databaseSchemaComponentType;
