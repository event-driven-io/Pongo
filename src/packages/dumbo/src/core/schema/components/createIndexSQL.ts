import {
  SQL,
  SQLIndexReference,
  SQLJSONDocumentIndexTarget,
  SQLJSONPathTarget,
  SQLTableReference,
  type SQL as SQLStatement,
} from '../../sql';
import type { IndexIdentifier } from './databaseMigrations';
import {
  isJSONDocumentIndexTarget,
  isJSONPathIndexTarget,
  type AnyIndexComponent,
} from './indexComponent';

const indexTargetSQL = (index: AnyIndexComponent): SQLStatement => {
  const target = index.target;

  if (target !== undefined && isJSONDocumentIndexTarget(target))
    return SQL`${SQLJSONDocumentIndexTarget.from({
      columnName: target.columnName,
      isUnique: index.isUnique,
    })}`;

  if (target !== undefined && isJSONPathIndexTarget(target))
    return SQL`${SQLJSONPathTarget.from({
      columnName: target.columnName,
      path:
        typeof target.path === 'string' ? target.path : target.path.join('.'),
    })}`;

  return SQL`(${SQL.merge(
    index.columnNames.map((columnName) => SQL`${SQL.identifier(columnName)}`),
    ', ',
  )})`;
};

export const createIndexSQL = (
  index: AnyIndexComponent,
  identifier: IndexIdentifier,
): SQLStatement => {
  const tableReference = SQL`${SQLTableReference.from(identifier)}`;
  const indexReference = SQL`${SQLIndexReference.from(identifier)}`;

  if (index.sql !== undefined)
    return index.sql({ ...identifier, tableReference, indexReference });

  const target = indexTargetSQL(index);

  return index.isUnique
    ? SQL`CREATE UNIQUE INDEX IF NOT EXISTS ${indexReference} ON ${tableReference} ${target}`
    : SQL`CREATE INDEX IF NOT EXISTS ${indexReference} ON ${tableReference} ${target}`;
};
