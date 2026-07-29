import {
  createTableSQL,
  isJSONDocumentIndexTarget,
  isJSONPathIndexTarget,
  SQL,
  type AnyIndexComponent,
  type AnyTableComponent,
  type IndexIdentifier,
  type TableIdentifier,
} from '../../../../core';
import { SQLiteJSON } from '../sql';
import { sqliteIndexName, sqliteTableName } from './sqliteObjectNames';

export const sqliteTableReference = (identifier: TableIdentifier): SQL =>
  SQL`${SQL.identifier(sqliteTableName(identifier))}`;

export const sqliteIndexReference = (identifier: IndexIdentifier): SQL =>
  SQL`${SQL.identifier(sqliteIndexName(identifier))}`;

export const sqliteTableSQL = (
  component: AnyTableComponent,
  identifier: TableIdentifier,
): SQL => createTableSQL(component, sqliteTableReference(identifier));

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

export const sqliteIndexSQL = (
  component: AnyIndexComponent,
  identifier: IndexIdentifier,
): SQL => {
  const tableReference = sqliteTableReference(identifier);
  const indexReference = sqliteIndexReference(identifier);
  const context = { ...identifier, tableReference, indexReference };

  if (component.sql !== undefined) return component.sql(context);

  const target = component.target;
  if (target !== undefined && isJSONDocumentIndexTarget(target)) {
    return createIndexSQL({
      index: indexReference,
      table: tableReference,
      target: SQL`${SQL.identifier(target.columnName)}`,
      unique: component.isUnique,
    });
  }

  if (target !== undefined && isJSONPathIndexTarget(target)) {
    const path =
      typeof target.path === 'string' ? target.path : target.path.join('.');
    return createIndexSQL({
      index: indexReference,
      table: tableReference,
      target: SQL`json_extract(${SQL.identifier(target.columnName)}, ${SQLiteJSON.path(path)})`,
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
