import { SQLDefaultSchemaNameToken } from '../../sql';
import type { SchemaComponentContext } from '../schemaComponent';
import type { AnyDatabaseComponent } from './databaseComponent';
import type { AnyTableComponent } from './tableComponent';

export type FindTablesContext = SchemaComponentContext &
  Readonly<{
    databaseSchemaName: string | SQLDefaultSchemaNameToken;
    tableName: string;
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

export const findTables = (
  database: AnyDatabaseComponent,
  context: FindTablesContext,
): ReadonlyArray<FoundTable> => {
  const defaultSchemaName = context.defaults?.schemaName;
  const searched = resolvedSchemaName(
    context.databaseSchemaName,
    defaultSchemaName,
  );
  const databaseSchemaName = searched ?? SQLDefaultSchemaNameToken.from();
  const isSearched = (table: AnyTableComponent) =>
    table.tableName === context.tableName;

  const schemas = [
    database.defaultSchema,
    ...Object.values(database.schemas),
    ...Object.values(database.extensions).flatMap((extension) =>
      Object.values(extension.schemas),
    ),
  ].filter(
    (schema) =>
      resolvedSchemaName(schema.schemaName, defaultSchemaName) === searched,
  );

  return schemas
    .flatMap((schema) => [
      ...Object.values(schema.tables),
      ...Object.values(schema.extensions).flatMap((extension) =>
        Object.values(extension.tables),
      ),
    ])
    .filter(isSearched)
    .map((table) => ({ databaseSchemaName, table }));
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
