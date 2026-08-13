import {
  databaseSchemaKey,
  type AnyDatabaseComponent,
} from './databaseComponent';
import type { AnyDatabaseSchemaComponent } from './databaseSchemaComponent';
import type { AnyTableComponent } from './tableComponent';

export const findTables = (
  database: AnyDatabaseComponent,
  schemaKey: string,
  tableName: string,
): ReadonlyArray<{
  schema: AnyDatabaseSchemaComponent;
  table: AnyTableComponent;
}> => {
  const declaredSchema = database.schemas[schemaKey];
  const contributedSchemas = Object.values(database.extensions).flatMap(
    (extension) =>
      Object.values(extension.schemas).filter(
        (schema) => databaseSchemaKey(schema.schemaName) === schemaKey,
      ),
  );
  const candidateSchemas =
    declaredSchema !== undefined
      ? [declaredSchema, ...contributedSchemas]
      : contributedSchemas;

  return candidateSchemas.flatMap((schema) =>
    [
      ...Object.values(schema.tables),
      ...Object.values(schema.extensions).flatMap((extension) =>
        Object.values(extension.tables),
      ),
    ]
      .filter((table) => table.tableName === tableName)
      .map((table) => ({ schema, table })),
  );
};
