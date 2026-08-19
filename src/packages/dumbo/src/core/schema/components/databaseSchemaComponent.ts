import type { SQLDefaultSchemaNameToken } from '../../sql';
import { SQL, SQLCreateSchema } from '../../sql';
import type { UnionToIntersection } from '../../typing';
import type { AnyExtensionComponent } from '../extensionComponent';
import {
  schemaComponent,
  schemaComponentMap,
  type MergeRecords,
  type SchemaComponent,
} from '../schemaComponent';
import { sqlMigration, type SQLMigration } from '../sqlMigration';
import { migrationName } from './migrationName';
import type { AnyTableComponent } from './tableComponent';

export const databaseSchemaComponentType: unique symbol = Symbol(
  'dumbo.schemaComponent.databaseSchema',
);

const databaseSchemaMigrationName = (
  databaseSchemaName: string,
  kind: string | undefined,
): string => migrationName('schema', kind, [databaseSchemaName], 'create');

const generatedDatabaseSchemaMigrations = (
  databaseSchemaName: string | SQLDefaultSchemaNameToken,
  kind: string | undefined,
): ReadonlyArray<SQLMigration> => {
  if (typeof databaseSchemaName !== 'string') return [];

  return [
    sqlMigration(databaseSchemaMigrationName(databaseSchemaName, kind), [
      SQL`${SQLCreateSchema.from({ databaseSchemaName })}`,
    ]),
  ];
};

export const assertTableNamesAreUnique = (
  databaseSchemaName: string | SQLDefaultSchemaNameToken | undefined,
  tables: Iterable<AnyTableComponent>,
): void => {
  const schemaNameLabel =
    typeof databaseSchemaName === 'string'
      ? databaseSchemaName
      : 'the default schema';
  const tableNames = new Set<string>();

  for (const table of tables) {
    if (tableNames.has(table.tableName))
      throw new Error(
        `Table "${table.tableName}" is declared more than once in database schema "${schemaNameLabel}"`,
      );

    tableNames.add(table.tableName);
  }
};

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
  SchemaName extends string | SQLDefaultSchemaNameToken =
    string | SQLDefaultSchemaNameToken,
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
  string | SQLDefaultSchemaNameToken,
  SchemaExtensions
>;

export type DatabaseSchemaComponentOptions<
  Tables extends DatabaseSchemaTables,
  SchemaName extends string | SQLDefaultSchemaNameToken,
  Extensions extends SchemaExtensions,
> = Readonly<{
  schemaName: SchemaName;
  kind?: string | undefined;
  tables?: Tables | undefined;
  extensions?: Extensions | undefined;
  migrations?:
    | ((
        databaseSchemaName: string | SQLDefaultSchemaNameToken,
      ) => ReadonlyArray<SQLMigration>)
    | undefined;
}>;

export const databaseSchemaComponent = <
  const Tables extends DatabaseSchemaTables = DatabaseSchemaTables,
  const SchemaName extends string | SQLDefaultSchemaNameToken = string,
  const Extensions extends SchemaExtensions = Readonly<Record<never, never>>,
>(
  options: DatabaseSchemaComponentOptions<Tables, SchemaName, Extensions>,
): DatabaseSchemaComponent<Tables, SchemaName, Extensions> => {
  const tables = (options.tables ?? {}) as Tables;
  const extensions = (options.extensions ?? {}) as Extensions;
  const schemaNameLabel =
    typeof options.schemaName === 'string'
      ? options.schemaName
      : 'the default schema';
  if (options.schemaName === '')
    throw new Error(
      'A database schema name cannot be empty. Use the default schema token to leave it to the dialect',
    );
  assertTableNamesAreUnique(options.schemaName, [
    ...Object.values(tables),
    ...Object.values(extensions).flatMap((extension) =>
      Object.values(extension.tables),
    ),
  ]);
  for (const extension of Object.values(extensions)) {
    const [contributedSchema] = Object.values(extension.schemas);
    if (contributedSchema === undefined) continue;

    const contributedSchemaName =
      typeof contributedSchema.schemaName === 'string'
        ? `"${contributedSchema.schemaName}"`
        : 'the default schema';
    throw new Error(
      `Extension "${extension.extensionName}" contributes database schema ${contributedSchemaName} and cannot be attached to database schema "${schemaNameLabel}"`,
    );
  }
  const placedTables = Object.fromEntries(
    Object.entries(tables).map(([key, table]) => [
      key,
      table.withDatabaseSchemaName(options.schemaName),
    ]),
  ) as Tables;
  const placedExtensions = Object.fromEntries(
    Object.entries(extensions).map(([key, extension]) => [
      key,
      extension.withDatabaseSchemaName(options.schemaName),
    ]),
  ) as Extensions;
  const extensionTables = Object.assign(
    {},
    ...Object.values(placedExtensions).map((extension) => extension.tables),
  ) as DatabaseSchemaTables;
  const allTables = schemaComponentMap({
    ...extensionTables,
    ...placedTables,
  } as WithExtensionTables<Tables, Extensions>);
  const children = Object.freeze([
    ...Object.values(placedTables),
    ...Object.values(placedExtensions),
  ]);
  const ownMigrations = () =>
    options.migrations !== undefined
      ? options.migrations(options.schemaName)
      : generatedDatabaseSchemaMigrations(options.schemaName, options.kind);

  const component: DatabaseSchemaComponent<Tables, SchemaName, Extensions> = {
    ...schemaComponent(databaseSchemaComponentType, {
      components: children,
      migrations: ownMigrations,
    }),
    schemaName: options.schemaName,
    tables: allTables,
    extensions: schemaComponentMap(placedExtensions),
    findTable: (tableName: string) =>
      Object.values<AnyTableComponent>(allTables).find(
        (table) => table.tableName === tableName,
      ),
    withTable: <const Added extends DatabaseSchemaTables>(added: Added) =>
      databaseSchemaComponent<
        MergeRecords<Tables, Added>,
        SchemaName,
        Extensions
      >({
        schemaName: options.schemaName,
        kind: options.kind,
        tables: { ...placedTables, ...added },
        extensions,
        migrations: options.migrations,
      }),
  };

  return component;
};
