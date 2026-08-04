import type { ExtensionComponent } from '../extensionComponent';
import {
  createSchemaComponent,
  mergeSchemaComponentMaps,
  schemaComponentMap,
  schemaComponentType,
  type AnySchemaComponent,
  type SchemaComponent,
  type SchemaComponentOptions,
} from '../schemaComponent';
import type { AnyDatabaseSchemaComponent } from './databaseSchemaComponent';

export const databaseComponentType: unique symbol = Symbol(
  'dumbo.schemaComponent.database',
);

export type DatabaseSchemas = Readonly<
  Record<string, AnyDatabaseSchemaComponent>
>;
export type DatabaseExtensions = Readonly<Record<string, ExtensionComponent>>;

export type DatabaseComponent<
  Schemas extends DatabaseSchemas = DatabaseSchemas,
  DatabaseName extends string | undefined = string | undefined,
  Extensions extends DatabaseExtensions = DatabaseExtensions,
> = SchemaComponent<typeof databaseComponentType> &
  Readonly<{
    databaseName: DatabaseName;
    schemas: Schemas;
    extensions: Extensions;
  }>;

export type AnyDatabaseComponent = DatabaseComponent<
  DatabaseSchemas,
  string | undefined,
  DatabaseExtensions
>;

export type DatabaseComponentOptions<
  Schemas extends DatabaseSchemas,
  DatabaseName extends string | undefined,
  Extensions extends DatabaseExtensions,
> = Readonly<{
  databaseName?: DatabaseName | undefined;
  schemas?: Schemas | undefined;
  extensions?: Extensions | undefined;
}> &
  Omit<SchemaComponentOptions, 'components'>;

export const databaseComponent = <
  const Schemas extends DatabaseSchemas = DatabaseSchemas,
  const DatabaseName extends string | undefined = undefined,
  const Extensions extends DatabaseExtensions = DatabaseExtensions,
>(
  options: DatabaseComponentOptions<Schemas, DatabaseName, Extensions>,
): DatabaseComponent<Schemas, DatabaseName, Extensions> => {
  const schemas = (options.schemas ?? {}) as Schemas;
  const databaseName = options.databaseName;
  for (const [schemaName, schema] of Object.entries(schemas)) {
    if (
      databaseName !== undefined &&
      schema.databaseName !== undefined &&
      schema.databaseName !== databaseName
    ) {
      throw new Error(
        `Database schema "${schemaName}" is constrained to database "${schema.databaseName}" and cannot be placed in "${databaseName}"`,
      );
    }
    if (schema.schemaName !== undefined && schema.schemaName !== schemaName) {
      throw new Error(
        `Database schema record key "${schemaName}" conflicts with its explicit name "${schema.schemaName}"`,
      );
    }
  }
  const extensions = (options.extensions ?? {}) as Extensions;
  const base = createSchemaComponent(
    databaseComponentType,
    {
      components: mergeSchemaComponentMaps(schemas, extensions),
      migrations: options.migrations,
      context: { databaseName },
    },
    {
      databaseName: databaseName as DatabaseName,
      schemas: schemaComponentMap(schemas),
      extensions: schemaComponentMap(extensions),
    },
  );

  return base;
};

export const isDatabaseComponent = (
  component: AnySchemaComponent,
): component is AnyDatabaseComponent =>
  component[schemaComponentType] === databaseComponentType;
