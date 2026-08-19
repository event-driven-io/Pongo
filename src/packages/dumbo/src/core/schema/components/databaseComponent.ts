import { SQLDefaultSchemaNameToken } from '../../sql';
import type { AnyExtensionComponent } from '../extensionComponent';
import {
  schemaComponent,
  schemaComponentMap,
  type MergeRecords,
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

export type FindDatabaseTableOptions = Readonly<{
  databaseSchemaName?: string | undefined;
  defaultSchemaName?: string | undefined;
}>;

const resolveSchemaName = (
  schemaName: string | SQLDefaultSchemaNameToken,
  defaultSchemaName: string | undefined,
): string | undefined =>
  SQLDefaultSchemaNameToken.check(schemaName) ? defaultSchemaName : schemaName;

type SchemaWithTables<Schema, Added extends DatabaseTables> =
  Schema extends DatabaseSchemaComponent<
    infer Tables,
    infer SchemaName,
    infer Extensions
  >
    ? DatabaseSchemaComponent<
        MergeRecords<Tables, Added>,
        SchemaName,
        Extensions
      >
    : never;

type UpsertSchemaTables<
  Schemas extends DatabaseSchemas,
  SchemaName extends string,
  Added extends DatabaseTables,
> = string extends SchemaName
  ? Schemas & DatabaseSchemas
  : MergeRecords<
      Schemas,
      Readonly<
        Record<
          SchemaName,
          SchemaName extends keyof Schemas
            ? SchemaWithTables<Schemas[SchemaName], Added>
            : DatabaseSchemaComponent<Added, SchemaName>
        >
      >
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
    findTable: (
      tableName: string,
      options?: FindDatabaseTableOptions,
    ) => AnyTableComponent | undefined;
    withSchema: <const Added extends DatabaseSchemas>(
      schemas: Added,
    ) => DatabaseComponent<
      DatabaseName,
      Tables,
      MergeRecords<Schemas, Added>,
      Extensions
    >;
    withTable: {
      <const Added extends DatabaseTables>(
        tables: Added,
      ): DatabaseComponent<
        DatabaseName,
        MergeRecords<Tables, Added>,
        Schemas,
        Extensions
      >;
      <const Added extends DatabaseTables, const SchemaName extends string>(
        tables: Added,
        schemaName: SchemaName,
      ): DatabaseComponent<
        DatabaseName,
        Tables,
        UpsertSchemaTables<Schemas, SchemaName, Added>,
        Extensions
      >;
    };
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
    if (schemaName === '')
      throw new Error('Database schema record key cannot be an empty string');

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

  const component: DatabaseComponent<
    DatabaseName,
    Tables,
    Schemas,
    Extensions
  > = {
    ...schemaComponent(databaseComponentType, {
      components: children,
      migrations: options.migrations,
    }),
    databaseName: databaseName as DatabaseName,
    defaultSchema,
    get tables() {
      return defaultSchema.tables;
    },
    schemas: schemaComponentMap(schemas),
    extensions: schemaComponentMap(extensions),
    findTable: (
      tableName: string,
      findOptions: FindDatabaseTableOptions = {},
    ) => {
      const databaseSchemaName =
        findOptions.databaseSchemaName ?? findOptions.defaultSchemaName;
      const [found, duplicate] = [
        defaultSchema,
        ...Object.values(schemas),
        ...Object.values(extensions).flatMap((extension) =>
          Object.values(extension.schemas),
        ),
      ]
        .filter(
          (schema) =>
            resolveSchemaName(
              schema.schemaName,
              findOptions.defaultSchemaName,
            ) === databaseSchemaName,
        )
        .map((schema) => schema.findTable(tableName))
        .filter((table) => table !== undefined);

      if (duplicate !== undefined) {
        const placement =
          databaseSchemaName === undefined
            ? 'the default database schema'
            : `database schema "${databaseSchemaName}"`;
        throw new Error(
          `Table "${tableName}" is declared more than once in ${placement}`,
        );
      }

      return found;
    },
    withSchema: <const Added extends DatabaseSchemas>(added: Added) =>
      databaseComponent<
        DatabaseName,
        Tables,
        MergeRecords<Schemas, Added>,
        Extensions
      >({
        databaseName,
        tables: defaultSchema.tables,
        schemas: { ...schemas, ...added },
        extensions,
        migrations: options.migrations,
      }),
    withTable: ((added: DatabaseTables, schemaName?: string) => {
      if (schemaName === undefined) {
        const nextDefaultSchema = defaultSchema.withTable(added);

        return databaseComponent({
          databaseName,
          tables: nextDefaultSchema.tables,
          schemas,
          extensions,
          migrations: options.migrations,
        });
      }

      const schema = Object.hasOwn(schemas, schemaName)
        ? schemas[schemaName]!
        : databaseSchemaComponent({ schemaName });
      const nextSchema = schema.withTable(added);

      return component.withSchema({ [schemaName]: nextSchema });
    }) as DatabaseComponent<
      DatabaseName,
      Tables,
      Schemas,
      Extensions
    >['withTable'],
  };

  return component;
};
