import { SQLDefaultSchemaNameToken } from '../../sql';
import type { SchemaComponentContext } from '../schemaComponent';
import type { AnyDatabaseComponent } from './databaseComponent';
import type { AnyDatabaseSchemaComponent } from './databaseSchemaComponent';
import type { AnyTableComponent } from './tableComponent';

export type FindDatabaseSchemasContext = SchemaComponentContext &
  Readonly<{
    databaseSchemaName: string | SQLDefaultSchemaNameToken;
  }>;

export type FindTablesContext = FindDatabaseSchemasContext &
  Readonly<{
    tableName: string;
  }>;

export type FoundDatabaseSchema = Readonly<{
  databaseSchemaName: string | SQLDefaultSchemaNameToken;
  schema: AnyDatabaseSchemaComponent;
}>;

export type FoundTable = Readonly<{
  databaseSchemaName: string | SQLDefaultSchemaNameToken;
  table: AnyTableComponent;
}>;

const resolvedSchemaName = (
  schemaName: string | SQLDefaultSchemaNameToken,
  defaultSchemaName: string | undefined,
): string | undefined =>
  SQLDefaultSchemaNameToken.check(schemaName) ? defaultSchemaName : schemaName;

export const findDatabaseSchemas = (
  database: AnyDatabaseComponent,
  context: FindDatabaseSchemasContext,
): ReadonlyArray<FoundDatabaseSchema> => {
  const defaultSchemaName = context.defaults?.schemaName;
  const searched = resolvedSchemaName(
    context.databaseSchemaName,
    defaultSchemaName,
  );
  const databaseSchemaName = searched ?? SQLDefaultSchemaNameToken.from();

  return [
    database.defaultSchema,
    ...Object.values(database.schemas),
    ...Object.values(database.extensions).flatMap((extension) =>
      Object.values(extension.schemas),
    ),
  ]
    .filter(
      (schema) =>
        resolvedSchemaName(schema.schemaName, defaultSchemaName) === searched,
    )
    .map((schema) => ({ databaseSchemaName, schema }));
};

export const findTables = (
  database: AnyDatabaseComponent,
  context: FindTablesContext,
): ReadonlyArray<FoundTable> => {
  const isSearched = (table: AnyTableComponent) =>
    table.tableName === context.tableName;

  return findDatabaseSchemas(database, context)
    .flatMap(({ databaseSchemaName, schema }) =>
      [
        ...Object.values(schema.tables),
        ...Object.values(schema.extensions).flatMap((extension) =>
          Object.values(extension.tables),
        ),
      ].map((table) => ({ databaseSchemaName, table })),
    )
    .filter(({ table }) => isSearched(table));
};

export const findTable = (
  database: AnyDatabaseComponent,
  context: FindTablesContext,
): FoundTable | undefined => {
  const [found, duplicate] = findTables(database, context);

  if (duplicate !== undefined) {
    const placement =
      typeof duplicate.databaseSchemaName === 'string'
        ? `database schema "${duplicate.databaseSchemaName}"`
        : 'the default database schema';
    throw new Error(
      `Table "${context.tableName}" is declared more than once in ${placement}`,
    );
  }

  return found;
};
