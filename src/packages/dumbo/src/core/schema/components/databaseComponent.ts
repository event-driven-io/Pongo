import { SQLDefaultSchemaNameToken } from '../../sql';
import type {
  AnyExtensionComponent,
  SchemasFromExtensions,
} from '../extensionComponent';
import {
  schemaComponent,
  schemaComponentMap,
  type SchemaComponent,
  type SchemaComponentContext,
} from '../schemaComponent';
import type { SQLMigration } from '../sqlMigration';
import type { AnyDatabaseSchemaComponent } from './databaseSchemaComponent';

export const databaseComponentType: unique symbol = Symbol(
  'dumbo.schemaComponent.database',
);

export const defaultDatabaseSchemaKey = '';

export const databaseSchemaKey = (
  schemaName: string | SQLDefaultSchemaNameToken,
): string =>
  SQLDefaultSchemaNameToken.check(schemaName)
    ? defaultDatabaseSchemaKey
    : schemaName;

export type DatabaseSchemas = Readonly<
  Record<string, AnyDatabaseSchemaComponent>
>;
export type DatabaseExtensions = Readonly<
  Record<string, AnyExtensionComponent>
>;

export type DatabaseComponent<
  Schemas extends DatabaseSchemas = DatabaseSchemas,
  DatabaseName extends string | undefined = string | undefined,
  Extensions extends DatabaseExtensions = DatabaseExtensions,
> = SchemaComponent<typeof databaseComponentType> &
  Readonly<{
    databaseName: DatabaseName;
    schemas: Schemas & SchemasFromExtensions<Extensions>;
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
  migrations?:
    | ((context: SchemaComponentContext) => ReadonlyArray<SQLMigration>)
    | undefined;
}>;

export const databaseComponent = <
  const Schemas extends DatabaseSchemas = DatabaseSchemas,
  const DatabaseName extends string | undefined = undefined,
  const Extensions extends DatabaseExtensions = DatabaseExtensions,
>(
  options: DatabaseComponentOptions<Schemas, DatabaseName, Extensions>,
): DatabaseComponent<Schemas, DatabaseName, Extensions> => {
  const schemas = (options.schemas ?? {}) as Schemas;
  const databaseName = options.databaseName;
  const exposedSchemaEntries: [string, AnyDatabaseSchemaComponent][] = [];
  const schemaOwners = new Map<string, string | undefined>();
  for (const [schemaName, schema] of Object.entries(schemas)) {
    if (
      typeof schema.schemaName === 'string' &&
      schema.schemaName !== schemaName
    ) {
      throw new Error(
        `Database schema record key "${schemaName}" conflicts with its explicit name "${schema.schemaName}"`,
      );
    }
    exposedSchemaEntries.push([schemaName, schema]);
    schemaOwners.set(schemaName, undefined);
  }
  const extensions = (options.extensions ?? {}) as Extensions;
  for (const extension of Object.values(extensions)) {
    for (const [schemaName, schema] of Object.entries(extension.schemas)) {
      if (schemaOwners.has(schemaName)) {
        const owner = schemaOwners.get(schemaName);
        throw new Error(
          owner === undefined
            ? `Database schema key "${schemaName}" is declared directly and by extension "${extension.extensionName}"`
            : `Database schema key "${schemaName}" is declared by extensions "${owner}" and "${extension.extensionName}"`,
        );
      }
      exposedSchemaEntries.push([schemaName, schema]);
      schemaOwners.set(schemaName, extension.extensionName);
    }
  }
  const children = Object.freeze([
    ...Object.values(schemas),
    ...Object.values(extensions),
  ]);

  const component: DatabaseComponent<Schemas, DatabaseName, Extensions> = {
    ...schemaComponent(databaseComponentType, {
      components: children,
      migrations: options.migrations,
    }),
    databaseName: databaseName as DatabaseName,
    schemas: schemaComponentMap(
      Object.fromEntries(exposedSchemaEntries),
    ) as Schemas & SchemasFromExtensions<Extensions>,
    extensions: schemaComponentMap(extensions),
  };

  return component;
};
