import { SQLDefaultSchemaNameToken } from '../../sql';

export type MigrationNamePrefixes = Readonly<{
  databaseSchema?: string | undefined;
  table?: string | undefined;
  index?: string | undefined;
}>;

export const defaultMigrationNamePrefixes = {
  databaseSchema: 'dumboSchema',
  table: 'dumboTable',
  index: 'dumboIndex',
} as const;

const schemaSegment = (
  databaseSchemaName: string | SQLDefaultSchemaNameToken | undefined,
): string =>
  databaseSchemaName === undefined ||
  SQLDefaultSchemaNameToken.check(databaseSchemaName)
    ? ''
    : `${databaseSchemaName}:`;

export const databaseSchemaMigrationName = (
  databaseSchemaName: string | SQLDefaultSchemaNameToken | undefined,
  prefixes: MigrationNamePrefixes | undefined,
): string =>
  `${prefixes?.databaseSchema ?? defaultMigrationNamePrefixes.databaseSchema}:${schemaSegment(databaseSchemaName)}001:create`;

export const tableMigrationName = (
  identifier: Readonly<{
    databaseSchemaName: string | SQLDefaultSchemaNameToken | undefined;
    tableName: string;
  }>,
  prefixes: MigrationNamePrefixes | undefined,
): string =>
  `${prefixes?.table ?? defaultMigrationNamePrefixes.table}:${schemaSegment(identifier.databaseSchemaName)}${identifier.tableName}:001:createtable`;

export const indexMigrationName = (
  identifier: Readonly<{
    databaseSchemaName: string | SQLDefaultSchemaNameToken | undefined;
    tableName: string;
    indexName: string;
  }>,
  prefixes: MigrationNamePrefixes | undefined,
): string =>
  `${prefixes?.index ?? defaultMigrationNamePrefixes.index}:${schemaSegment(identifier.databaseSchemaName)}${identifier.tableName}:${identifier.indexName}:create`;
