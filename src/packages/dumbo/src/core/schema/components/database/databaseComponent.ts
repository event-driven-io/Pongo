import {
  DefaultDatabaseSchemaName,
  isDefaultDatabaseSchema,
} from '../../../sql';
import type { UnionToIntersection } from '../../../typing';
import {
  mergeSchemaComponentMaps,
  schemaComponent,
  schemaComponentMap,
  type MergeRecords,
  type SchemaComponent,
} from '../../schemaComponent';
import type { SQLMigration } from '../../sqlMigration';
import {
  assertSchemaKeysAreNotEmpty,
  assertTableNamesAreUnique,
  databaseSchemaComponent,
  type AnyDatabaseSchemaComponent,
  type DatabaseSchemaComponent,
  type WithExtensionTables,
} from '../databaseSchema/databaseSchemaComponent';
import type { AnyExtensionComponent } from '../extensions';
import type { AnyTableComponent } from '../table';

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
    defaultSchema: DatabaseSchemaComponent<Tables, string, Extensions>;
    tables: WithExtensionTables<Tables, Extensions>;
    schemas: MergeRecords<
      Readonly<
        Record<
          DefaultDatabaseSchemaName,
          DatabaseSchemaComponent<Tables, string, Extensions>
        >
      >,
      WithExtensionSchemas<Schemas, Extensions>
    >;
    extensions: Extensions;
    findTable: (options: {
      tableName: string;
      databaseSchemaName?: string | undefined;
    }) => AnyTableComponent | undefined;
    findSchema: (
      databaseSchemaName?: string,
    ) => AnyDatabaseSchemaComponent | undefined;
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
  const { databaseName, defaultSchemaName = DefaultDatabaseSchemaName } =
    options;
  const schemas = (options.schemas ?? {}) as Schemas;
  const extensions = (options.extensions ?? {}) as Extensions;

  assertSchemaKeysAreNotEmpty(schemas);

  const hasTables = (extension: AnyExtensionComponent) =>
    Object.keys(extension.tables).length > 0;

  const defaultSchema = databaseSchemaComponent<Tables, string, Extensions>({
    schemaName: defaultSchemaName,
    tables: options.tables,
    extensions: Object.fromEntries(
      Object.entries(extensions).filter(([, extension]) =>
        hasTables(extension),
      ),
    ) as Extensions,
  });

  const allSchemas = mergeSchemaComponentMaps<
    DatabaseComponent<DatabaseName, Tables, Schemas, Extensions>['schemas']
  >(
    { [DefaultDatabaseSchemaName]: defaultSchema },
    ...Object.values(extensions).map((extension) => extension.schemas),
    schemas,
  );

  const resolveSchemaName = (databaseSchemaName: string | undefined): string =>
    isDefaultDatabaseSchema(databaseSchemaName)
      ? defaultSchemaName
      : databaseSchemaName;

  const schemasByName = Map.groupBy(
    Object.values<AnyDatabaseSchemaComponent>(allSchemas),
    (schema) => schema.schemaName,
  );

  for (const [resolvedSchemaName, named] of schemasByName)
    assertTableNamesAreUnique(
      resolvedSchemaName,
      named.flatMap((schema) => Object.values(schema.tables)),
    );

  const component: DatabaseComponent<
    DatabaseName,
    Tables,
    Schemas,
    Extensions
  > = {
    ...schemaComponent(databaseComponentType, {
      components: Object.freeze([
        defaultSchema,
        ...Object.values(schemas),
        ...Object.values(extensions).filter(
          (extension) => !hasTables(extension),
        ),
      ]),
      migrations: options.migrations,
    }),
    databaseName: databaseName as DatabaseName,
    defaultSchema,
    tables: defaultSchema.tables,
    schemas: allSchemas,
    extensions: schemaComponentMap(extensions),
    findTable: ({ tableName, databaseSchemaName }) =>
      (schemasByName.get(resolveSchemaName(databaseSchemaName)) ?? [])
        .map((schema) => schema.findTable(tableName))
        .find((table) => table !== undefined),
    findSchema: (databaseSchemaName) =>
      schemasByName.get(resolveSchemaName(databaseSchemaName))?.[0],
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
      >({ ...options, schemas: { ...schemas, ...added } }),
    withTable: ((added: DatabaseTables, schemaName?: string) => {
      const resolvedSchemaName = resolveSchemaName(schemaName);

      if (resolvedSchemaName === defaultSchemaName)
        return buildDatabaseComponent({
          ...options,
          tables: { ...options.tables, ...added },
        });

      const [schemaKey, schema] = Object.entries<AnyDatabaseSchemaComponent>(
        schemas,
      ).find(([, declared]) => declared.schemaName === resolvedSchemaName) ?? [
        resolvedSchemaName,
        databaseSchemaComponent({ schemaName: resolvedSchemaName }),
      ];

      return component.withSchema({ [schemaKey]: schema.withTable(added) });
    }) as DatabaseComponent<
      DatabaseName,
      Tables,
      Schemas,
      Extensions
    >['withTable'],
  };

  return component;
};
