import {
  createTableSQL,
  SQL,
  sqlMigration,
  type AnyIndexComponent,
  type AnyTableComponent,
  type DatabaseMigrationBuilder,
  type IndexIdentifier,
  type TableIdentifier,
} from '@event-driven-io/dumbo';
import {
  SQLiteJSON,
  sqliteIndexName,
  sqliteMetadata,
  sqliteTableName,
} from '@event-driven-io/dumbo/sqlite';
import {
  isPongoCollectionComponent,
  isPongoIndexComponent,
  pongoIndexStrategy,
  pongoJsonDocumentIndex,
} from '../../../core';

const tableMigrations = (
  component: AnyTableComponent,
  identifier: TableIdentifier,
) => {
  if (!isPongoCollectionComponent(component)) return [];

  const physicalName = sqliteTableName(identifier);
  const migrationName =
    identifier.databaseSchemaName === sqliteMetadata.defaultSchemaName
      ? identifier.tableName
      : `${identifier.databaseSchemaName}:${identifier.tableName}`;
  return [
    sqlMigration(`pongoCollection:${migrationName}:001:createtable`, [
      createTableSQL(component, SQL.identifier(physicalName)),
    ]),
  ];
};

const indexMigrations = (
  component: AnyIndexComponent,
  identifier: IndexIdentifier,
) => {
  if (!isPongoIndexComponent(component)) return [];

  const tableReference = SQL`${SQL.identifier(sqliteTableName(identifier))}`;
  const indexReference = SQL`${SQL.identifier(sqliteIndexName(identifier))}`;
  const path =
    typeof component.path === 'string'
      ? component.path
      : component.path?.join('.');
  const context = {
    ...identifier,
    tableReference,
    indexReference,
  };
  const target = SQLiteJSON.path(path ?? component.indexTargetNames.join('.'));
  const sql =
    component.sql?.(context) ??
    (component[pongoIndexStrategy] === pongoJsonDocumentIndex
      ? SQL`CREATE INDEX ${indexReference} ON ${tableReference} (data)`
      : component.isUnique
        ? SQL`CREATE UNIQUE INDEX ${indexReference} ON ${tableReference} (json_extract(data, ${target}))`
        : SQL`CREATE INDEX ${indexReference} ON ${tableReference} (json_extract(data, ${target}))`);

  return [
    sqlMigration(
      `pongoIndex:${identifier.databaseSchemaName}:${identifier.tableName}:${component.indexName}:create`,
      [sql],
    ),
  ];
};

export const pongoSQLiteMigrationBuilder: DatabaseMigrationBuilder = {
  table: tableMigrations,
  index: indexMigrations,
};
