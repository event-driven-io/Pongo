import {
  SQLDefaultSchemaNameToken,
  type DatabaseSchemaIdentifier,
  type IndexIdentifier,
  type TableIdentifier,
} from '@event-driven-io/dumbo';

const schemaSegment = (
  databaseSchemaName: string | SQLDefaultSchemaNameToken,
  defaultSchemaName?: string,
): string =>
  SQLDefaultSchemaNameToken.check(databaseSchemaName) ||
  databaseSchemaName === defaultSchemaName
    ? ''
    : `${databaseSchemaName}:`;

export const pongoDatabaseSchemaMigrationName = (
  identifier: DatabaseSchemaIdentifier,
): string =>
  `pongoSchema:${schemaSegment(identifier.databaseSchemaName)}001:create`;

export const pongoCollectionMigrationName = (
  identifier: TableIdentifier,
  defaultSchemaName: string,
): string =>
  `pongoCollection:${schemaSegment(identifier.databaseSchemaName, defaultSchemaName)}${identifier.tableName}:001:createtable`;

export const pongoIndexMigrationName = (identifier: IndexIdentifier): string =>
  `pongoIndex:${schemaSegment(identifier.databaseSchemaName)}${identifier.tableName}:${identifier.indexName}:create`;
