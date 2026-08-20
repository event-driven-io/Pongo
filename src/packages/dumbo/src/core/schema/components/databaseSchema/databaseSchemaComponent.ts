import { isDefaultDatabaseSchema, SQL, SQLCreateSchema } from '../../../sql';
import type { UnionToIntersection } from '../../../typing';
import { migrationName } from '../../migrators/migrationName';
import {
  mergeSchemaComponentMaps,
  schemaComponent,
  schemaComponentMap,
  type MergeRecords,
  type SchemaComponent,
} from '../../schemaComponent';
import { sqlMigration, type SQLMigration } from '../../sqlMigration';
import type { AnyExtensionComponent } from '../extensions';
import type { AnyTableComponent } from '../table';

export const databaseSchemaComponentType: unique symbol = Symbol(
  'dumbo.schemaComponent.databaseSchema',
);

const databaseSchemaMigrationName = (
  databaseSchemaName: string,
  kind: string | undefined,
): string => migrationName('schema', kind, [databaseSchemaName], 'create');

const generatedDatabaseSchemaMigrations = (
  databaseSchemaName: string,
  kind: string | undefined,
): ReadonlyArray<SQLMigration> => {
  if (isDefaultDatabaseSchema(databaseSchemaName)) return [];

  return [
    sqlMigration(databaseSchemaMigrationName(databaseSchemaName, kind), [
      SQL`${SQLCreateSchema.from({ databaseSchemaName })}`,
    ]),
  ];
};

export const databaseSchemaLabel = (
  databaseSchemaName: string | undefined,
): string =>
  isDefaultDatabaseSchema(databaseSchemaName)
    ? 'the default schema'
    : databaseSchemaName;

export const assertTableNamesAreUnique = (
  databaseSchemaName: string | undefined,
  tables: Iterable<AnyTableComponent>,
): void => {
  const tableNames = new Set<string>();

  for (const table of tables) {
    if (tableNames.has(table.tableName))
      throw new Error(
        `Table "${table.tableName}" is declared more than once in database schema "${databaseSchemaLabel(databaseSchemaName)}"`,
      );

    tableNames.add(table.tableName);
  }
};

export const assertSchemaKeysAreNotEmpty = (
  schemas: Readonly<Record<string, AnyDatabaseSchemaComponent>>,
): void => {
  if (Object.keys(schemas).includes(''))
    throw new Error('Database schema record key cannot be an empty string');
};

const placeIn = <
  const Components extends Readonly<
    Record<
      string,
      {
        withDatabaseSchemaName: (databaseSchemaName: string) => unknown;
      }
    >
  >,
>(
  databaseSchemaName: string,
  components: Components,
): Components =>
  Object.fromEntries(
    Object.entries(components).map(([key, component]) => [
      key,
      component.withDatabaseSchemaName(databaseSchemaName),
    ]),
  ) as Components;

export type DatabaseSchemaTables = Readonly<Record<string, AnyTableComponent>>;
export type SchemaExtensions = Readonly<Record<string, AnyExtensionComponent>>;

export type WithExtensionTables<
  Tables extends DatabaseSchemaTables,
  Extensions extends SchemaExtensions,
> = [Extensions[keyof Extensions]] extends [never]
  ? Tables
  : MergeRecords<
      UnionToIntersection<Extensions[keyof Extensions]['tables']>,
      Tables
    >;

export type DatabaseSchemaComponent<
  Tables extends DatabaseSchemaTables = DatabaseSchemaTables,
  SchemaName extends string = string,
  Extensions extends SchemaExtensions = Readonly<Record<never, never>>,
> = SchemaComponent<typeof databaseSchemaComponentType> &
  Readonly<{
    schemaName: SchemaName;
    tables: WithExtensionTables<Tables, Extensions>;
    extensions: Extensions;
    findTable: (tableName: string) => AnyTableComponent | undefined;
    withTable: <const Added extends DatabaseSchemaTables>(
      tables: Added,
    ) => DatabaseSchemaComponent<
      MergeRecords<Tables, Added>,
      SchemaName,
      Extensions
    >;
  }>;

export type AnyDatabaseSchemaComponent = DatabaseSchemaComponent<
  DatabaseSchemaTables,
  string,
  SchemaExtensions
>;

export type DatabaseSchemaComponentOptions<
  Tables extends DatabaseSchemaTables,
  SchemaName extends string,
  Extensions extends SchemaExtensions,
> = Readonly<{
  schemaName: SchemaName;
  kind?: string | undefined;
  tables?: Tables | undefined;
  extensions?: Extensions | undefined;
  migrations?:
    ((databaseSchemaName: string) => ReadonlyArray<SQLMigration>) | undefined;
}>;

export const databaseSchemaComponent = <
  const Tables extends DatabaseSchemaTables = DatabaseSchemaTables,
  const SchemaName extends string = string,
  const Extensions extends SchemaExtensions = Readonly<Record<never, never>>,
>(
  options: DatabaseSchemaComponentOptions<Tables, SchemaName, Extensions>,
): DatabaseSchemaComponent<Tables, SchemaName, Extensions> => {
  const { schemaName, kind } = options;

  if (schemaName === '')
    throw new Error(
      'A database schema name cannot be empty. Use the default database schema name to leave it to the dialect',
    );

  const tables = placeIn(schemaName, (options.tables ?? {}) as Tables);
  const extensions = placeIn(
    schemaName,
    (options.extensions ?? {}) as Extensions,
  );

  const [contribution] = Object.values(extensions).flatMap((extension) =>
    Object.values(extension.schemas).map((schema) => ({ extension, schema })),
  );
  if (contribution !== undefined)
    throw new Error(
      `Extension "${contribution.extension.extensionName}" contributes database schema "${databaseSchemaLabel(
        contribution.schema.schemaName,
      )}" and cannot be attached to database schema "${databaseSchemaLabel(schemaName)}"`,
    );

  const extensionTables = Object.values(extensions).map(
    (extension) => extension.tables,
  );
  assertTableNamesAreUnique(schemaName, [
    ...extensionTables.flatMap((contributed) => Object.values(contributed)),
    ...Object.values(tables),
  ]);

  const allTables = mergeSchemaComponentMaps<
    WithExtensionTables<Tables, Extensions>
  >(...extensionTables, tables);

  const component: DatabaseSchemaComponent<Tables, SchemaName, Extensions> = {
    ...schemaComponent(databaseSchemaComponentType, {
      components: Object.freeze([
        ...Object.values(tables),
        ...Object.values(extensions),
      ]),
      migrations: () =>
        options.migrations !== undefined
          ? options.migrations(schemaName)
          : generatedDatabaseSchemaMigrations(schemaName, kind),
    }),
    schemaName,
    tables: allTables,
    extensions: schemaComponentMap(extensions),
    findTable: (tableName: string) =>
      Object.values<AnyTableComponent>(allTables).find(
        (table) => table.tableName === tableName,
      ),
    withTable: <const Added extends DatabaseSchemaTables>(added: Added) =>
      databaseSchemaComponent<
        MergeRecords<Tables, Added>,
        SchemaName,
        Extensions
      >({ ...options, tables: { ...tables, ...added } }),
  };

  return component;
};
