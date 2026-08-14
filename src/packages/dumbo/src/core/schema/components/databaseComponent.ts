import { SQLDefaultSchemaNameToken } from '../../sql';
import type { AnyExtensionComponent } from '../extensionComponent';
import {
  schemaComponent,
  schemaComponentMap,
  type SchemaComponent,
  type SchemaComponentContext,
} from '../schemaComponent';
import type { SQLMigration } from '../sqlMigration';
import {
  databaseSchemaComponent,
  type AnyDatabaseSchemaComponent,
  type DatabaseSchemaComponent,
} from './databaseSchemaComponent';
import type { AnyTableComponent } from './tableComponent';

export const databaseComponentType: unique symbol = Symbol(
  'dumbo.schemaComponent.database',
);

export type DatabaseTables = Readonly<Record<string, AnyTableComponent>>;
export type DatabaseSchemas = Readonly<
  Record<string, AnyDatabaseSchemaComponent>
>;
export type DatabaseExtensions = Readonly<
  Record<string, AnyExtensionComponent>
>;

export type DatabaseComponent<
  DatabaseName extends string | undefined = string | undefined,
  Tables extends DatabaseTables = DatabaseTables,
  Schemas extends DatabaseSchemas = DatabaseSchemas,
  Extensions extends DatabaseExtensions = DatabaseExtensions,
> = SchemaComponent<typeof databaseComponentType> &
  Readonly<{
    databaseName: DatabaseName;
    defaultSchema: DatabaseSchemaComponent<Tables, SQLDefaultSchemaNameToken>;
    tables: Tables;
    schemas: Schemas;
    extensions: Extensions;
  }>;

export type AnyDatabaseComponent = DatabaseComponent<
  string | undefined,
  DatabaseTables,
  DatabaseSchemas,
  DatabaseExtensions
>;

export type DatabaseComponentOptions<
  DatabaseName extends string | undefined = string | undefined,
  Tables extends DatabaseTables = DatabaseTables,
  Schemas extends DatabaseSchemas = DatabaseSchemas,
  Extensions extends DatabaseExtensions = DatabaseExtensions,
> = Readonly<{
  databaseName?: DatabaseName | undefined;
  tables?: Tables | undefined;
  schemas?: Schemas | undefined;
  extensions?: Extensions | undefined;
  migrations?:
    | ((context: SchemaComponentContext) => ReadonlyArray<SQLMigration>)
    | undefined;
}>;

export const databaseComponent = <
  const DatabaseName extends string | undefined = undefined,
  const Tables extends DatabaseTables = DatabaseTables,
  const Schemas extends DatabaseSchemas = DatabaseSchemas,
  const Extensions extends DatabaseExtensions = DatabaseExtensions,
>(
  options: DatabaseComponentOptions<DatabaseName, Tables, Schemas, Extensions>,
): DatabaseComponent<DatabaseName, Tables, Schemas, Extensions> => {
  const schemas = (options.schemas ?? {}) as Schemas;
  const databaseName = options.databaseName;
  for (const [schemaName, schema] of Object.entries(schemas)) {
    if (
      typeof schema.schemaName === 'string' &&
      schema.schemaName !== schemaName
    ) {
      throw new Error(
        `Database schema record key "${schemaName}" conflicts with its explicit name "${schema.schemaName}"`,
      );
    }
  }
  const extensions = (options.extensions ?? {}) as Extensions;
  const defaultSchemaExtensions: Record<string, AnyExtensionComponent> = {};
  const databaseExtensions: Record<string, AnyExtensionComponent> = {};

  for (const [key, extension] of Object.entries(extensions)) {
    if (Object.keys(extension.tables).length > 0)
      defaultSchemaExtensions[key] = extension;
    else databaseExtensions[key] = extension;
  }

  const defaultSchema = databaseSchemaComponent<
    Tables,
    SQLDefaultSchemaNameToken
  >({
    schemaName: SQLDefaultSchemaNameToken.from(),
    tables: options.tables,
    extensions: defaultSchemaExtensions,
  });

  const children = Object.freeze([
    defaultSchema,
    ...Object.values(schemas),
    ...Object.values(databaseExtensions),
  ]);
  const ownsMigrations = options.migrations !== undefined;

  const component: DatabaseComponent<
    DatabaseName,
    Tables,
    Schemas,
    Extensions
  > = {
    ...schemaComponent(databaseComponentType, {
      components: ownsMigrations ? [] : children,
      migrations: options.migrations,
    }),
    databaseName: databaseName as DatabaseName,
    defaultSchema,
    get tables() {
      return defaultSchema.tables;
    },
    schemas: schemaComponentMap(schemas),
    extensions: schemaComponentMap(extensions),
  };

  return component;
};
