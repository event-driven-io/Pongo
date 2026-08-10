import {
  createTableSQL,
  isJSONDocumentIndexTarget,
  isJSONPathIndexTarget,
  SQL,
  SQLCreateSchema,
  SQLDefaultSchemaNameToken,
  SQLTableReference,
  type AnyIndexComponent,
  type AnyTableComponent,
  type DatabaseSchemaIdentifier,
  type IndexIdentifier,
  type TableIdentifier,
} from '../../../../core';
import { PostgreSQLJSON } from '../sql';
import { postgreSQLMetadata } from './postgreSQLMetadata';

export const postgreSQLTableReference = (identifier: TableIdentifier): SQL =>
  SQL`${SQLTableReference.from(identifier)}`;

export const postgreSQLIndexReference = (identifier: IndexIdentifier): SQL =>
  SQL`${SQL.identifier(identifier.indexName)}`;

export const postgreSQLDatabaseSchemaSQL = (
  identifier: DatabaseSchemaIdentifier,
): SQL | undefined => {
  const { databaseSchemaName } = identifier;
  return SQLDefaultSchemaNameToken.check(databaseSchemaName) ||
    databaseSchemaName === postgreSQLMetadata.defaultSchemaName
    ? undefined
    : SQL`${SQLCreateSchema.from(identifier)}`;
};

export const postgreSQLTableSQL = (
  component: AnyTableComponent,
  identifier: TableIdentifier,
): SQL => createTableSQL(component, postgreSQLTableReference(identifier));

const createIndexSQL = ({
  index,
  table,
  target,
  unique,
}: {
  index: SQL;
  table: SQL;
  target: SQL;
  unique: boolean;
}): SQL =>
  unique
    ? SQL`CREATE UNIQUE INDEX ${index} ON ${table} (${target})`
    : SQL`CREATE INDEX ${index} ON ${table} (${target})`;

export const postgreSQLIndexSQL = (
  component: AnyIndexComponent,
  identifier: IndexIdentifier,
): SQL => {
  const tableReference = postgreSQLTableReference(identifier);
  const indexReference = postgreSQLIndexReference(identifier);
  const context = { ...identifier, tableReference, indexReference };

  if (component.sql !== undefined) return component.sql(context);

  const target = component.target;
  if (target !== undefined && isJSONDocumentIndexTarget(target)) {
    return SQL`CREATE INDEX ${indexReference} ON ${tableReference} USING GIN (${SQL.identifier(target.columnName)})`;
  }

  if (target !== undefined && isJSONPathIndexTarget(target)) {
    const path =
      typeof target.path === 'string' ? target.path : target.path.join('.');
    return createIndexSQL({
      index: indexReference,
      table: tableReference,
      target: SQL`(${SQL.identifier(target.columnName)} #>> ${PostgreSQLJSON.path(path)})`,
      unique: component.isUnique,
    });
  }

  return createIndexSQL({
    index: indexReference,
    table: tableReference,
    target: SQL.merge(
      component.columnNames.map(
        (columnName) => SQL`${SQL.identifier(columnName)}`,
      ),
      ', ',
    ),
    unique: component.isUnique,
  });
};
