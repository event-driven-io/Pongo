import type {
  DatabaseSchemaIdentifier,
  IndexIdentifier,
  TableIdentifier,
} from '@event-driven-io/dumbo';

export const pongoDatabaseSchemaMigrationName = (
  identifier: DatabaseSchemaIdentifier,
): string => `pongoSchema:${identifier.databaseSchemaName}:001:create`;

export const pongoCollectionMigrationName = (
  identifier: TableIdentifier,
  defaultSchemaName: string,
): string => {
  const table =
    identifier.databaseSchemaName === defaultSchemaName
      ? identifier.tableName
      : `${identifier.databaseSchemaName}:${identifier.tableName}`;
  return `pongoCollection:${table}:001:createtable`;
};

export const pongoIndexMigrationName = (identifier: IndexIdentifier): string =>
  `pongoIndex:${identifier.databaseSchemaName}:${identifier.tableName}:${identifier.indexName}:create`;
