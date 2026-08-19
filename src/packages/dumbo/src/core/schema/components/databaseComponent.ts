import { SQLDefaultSchemaNameToken } from '../../sql';
import type { UnionToIntersection } from '../../typing';
import type { AnyExtensionComponent } from '../extensionComponent';
import {
  schemaComponent,
  schemaComponentMap,
  type MergeRecords,
  type SchemaComponent,
} from '../schemaComponent';
import type { SQLMigration } from '../sqlMigration';
import {
  assertTableNamesAreUnique,
  databaseSchemaComponent,
  type AnyDatabaseSchemaComponent,
  type DatabaseSchemaComponent,
  type WithExtensionTables,
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

export type WithExtensionSchemas<
  Schemas extends DatabaseSchemas,
  Extensions extends DatabaseExtensions,
> = [Extensions[keyof Extensions]] extends [never]
  ? Schemas
  : MergeRecords<
      UnionToIntersection<Extensions[keyof Extensions]['schemas']>,
      Schemas
    >;

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
    defaultSchema: DatabaseSchemaComponent<
      Tables,
      string | SQLDefaultSchemaNameToken,
      Extensions
    >;
    tables: WithExtensionTables<Tables, Extensions>;
    schemas: WithExtensionSchemas<Schemas, Extensions>;
    extensions: Extensions;
    findTable: (options: {
      tableName: string;
      databaseSchemaName?: string | undefined;
    }) => AnyTableComponent | undefined;
    withDefaultSchemaName: (
      defaultSchemaName: string | undefined,
    ) => DatabaseComponent<DatabaseName, Tables, Schemas, Extensions>;
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

type DatabaseComponentSharedOptions<
  DatabaseName extends string | undefined,
  Extensions extends DatabaseExtensions,
> = Readonly<{
  databaseName?: DatabaseName | undefined;
  defaultSchemaName?: string | undefined;
  extensions?: Extensions | undefined;
  migrations?: (() => ReadonlyArray<SQLMigration>) | undefined;
}>;

export type DatabaseComponentOptions<
  DatabaseName extends string | undefined = string | undefined,
  Tables extends DatabaseTables = DatabaseTables,
  Schemas extends DatabaseSchemas = DatabaseSchemas,
  Extensions extends DatabaseExtensions = DatabaseExtensions,
> = DatabaseComponentSharedOptions<DatabaseName, Extensions> &
  (
    | Readonly<{ tables?: Tables | undefined; schemas?: never }>
    | Readonly<{ schemas?: Schemas | undefined; tables?: never }>
  );

type DatabaseComponentCompositionOptions<
  DatabaseName extends string | undefined,
  Tables extends DatabaseTables,
  Schemas extends DatabaseSchemas,
  Extensions extends DatabaseExtensions,
> = DatabaseComponentSharedOptions<DatabaseName, Extensions> &
  Readonly<{
    tables?: Tables | undefined;
    schemas?: Schemas | undefined;
  }>;

export const databaseComponent = <
  const DatabaseName extends string | undefined = undefined,
  const Tables extends DatabaseTables = DatabaseTables,
  const Schemas extends DatabaseSchemas = DatabaseSchemas,
  const Extensions extends DatabaseExtensions = Readonly<Record<never, never>>,
>(
  options: DatabaseComponentOptions<DatabaseName, Tables, Schemas, Extensions>,
): DatabaseComponent<DatabaseName, Tables, Schemas, Extensions> => {
  if (options.tables !== undefined && options.schemas !== undefined)
    throw new Error(
      'A database declaration can contain either tables or schemas, not both',
    );

  return buildDatabaseComponent<DatabaseName, Tables, Schemas, Extensions>(
    options,
  );
};

const buildDatabaseComponent = <
  const DatabaseName extends string | undefined = undefined,
  const Tables extends DatabaseTables = DatabaseTables,
  const Schemas extends DatabaseSchemas = DatabaseSchemas,
  const Extensions extends DatabaseExtensions = DatabaseExtensions,
>(
  options: DatabaseComponentCompositionOptions<
    DatabaseName,
    Tables,
    Schemas,
    Extensions
  >,
): DatabaseComponent<DatabaseName, Tables, Schemas, Extensions> => {
  const schemas = (options.schemas ?? {}) as Schemas;
  const databaseName = options.databaseName;
  const defaultSchemaName = options.defaultSchemaName;
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
    string | SQLDefaultSchemaNameToken,
    Extensions
  >({
    schemaName: defaultSchemaName ?? SQLDefaultSchemaNameToken.from(),
    tables: options.tables,
    extensions: defaultSchemaExtensions as Extensions,
  });

  const extensionSchemas = Object.assign(
    {},
    ...Object.values(extensions).map((extension) => extension.schemas),
  ) as DatabaseSchemas;
  const allSchemas = schemaComponentMap({
    ...extensionSchemas,
    ...schemas,
  } as WithExtensionSchemas<Schemas, Extensions>);

  const schemasByName = new Map<
    string | undefined,
    AnyDatabaseSchemaComponent[]
  >();
  for (const schema of [
    defaultSchema,
    ...Object.values<AnyDatabaseSchemaComponent>(allSchemas),
  ]) {
    const resolvedSchemaName = resolveSchemaName(
      schema.schemaName,
      defaultSchemaName,
    );
    const named = schemasByName.get(resolvedSchemaName) ?? [];
    named.push(schema);
    schemasByName.set(resolvedSchemaName, named);
  }
  for (const [resolvedSchemaName, named] of schemasByName)
    assertTableNamesAreUnique(
      resolvedSchemaName,
      named.flatMap((schema) => Object.values(schema.tables)),
    );

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
    schemas: allSchemas,
    extensions: schemaComponentMap(extensions),
    findTable: ({ tableName, databaseSchemaName }) =>
      (schemasByName.get(databaseSchemaName ?? defaultSchemaName) ?? [])
        .map((schema) => schema.findTable(tableName))
        .find((table) => table !== undefined),
    withDefaultSchemaName: (nextDefaultSchemaName: string | undefined) =>
      nextDefaultSchemaName === defaultSchemaName
        ? component
        : buildDatabaseComponent<DatabaseName, Tables, Schemas, Extensions>({
            ...options,
            defaultSchemaName: nextDefaultSchemaName,
          }),
    withSchema: <const Added extends DatabaseSchemas>(added: Added) =>
      buildDatabaseComponent<
        DatabaseName,
        Tables,
        MergeRecords<Schemas, Added>,
        Extensions
      >({
        databaseName,
        defaultSchemaName,
        tables: defaultSchema.tables,
        schemas: { ...schemas, ...added },
        extensions,
        migrations: options.migrations,
      }),
    withTable: ((added: DatabaseTables, schemaName?: string) => {
      if (schemaName === undefined) {
        const nextDefaultSchema = defaultSchema.withTable(added);

        return buildDatabaseComponent({
          databaseName,
          defaultSchemaName,
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
