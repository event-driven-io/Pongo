import { SQLDefaultSchemaNameToken } from '../../sql';

const schemaSegment = (
  databaseSchemaName: string | SQLDefaultSchemaNameToken | undefined,
): string =>
  databaseSchemaName === undefined ||
  SQLDefaultSchemaNameToken.check(databaseSchemaName)
    ? ''
    : `${databaseSchemaName}:`;

export const databaseSchemaMigrationName = (
  databaseSchemaName: string | SQLDefaultSchemaNameToken | undefined,
  kind: string,
): string => `schema:${kind}:${schemaSegment(databaseSchemaName)}001:create`;

export const tableMigrationName = (
  identifier: Readonly<{
    databaseSchemaName: string | SQLDefaultSchemaNameToken | undefined;
    tableName: string;
  }>,
  kind: string,
): string =>
  `table:${kind}:${schemaSegment(identifier.databaseSchemaName)}${identifier.tableName}:001:create`;

export const indexMigrationName = (
  identifier: Readonly<{
    databaseSchemaName: string | SQLDefaultSchemaNameToken | undefined;
    tableName: string;
    indexName: string;
  }>,
  kind: string,
): string =>
  `index:${kind}:${schemaSegment(identifier.databaseSchemaName)}${identifier.tableName}:${identifier.indexName}:001:create`;
