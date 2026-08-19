import {
  DefaultDatabaseSchemaName,
  type SQLIndexReference,
  type SQLTableReference,
} from '../../../../core';

const assertNativeName = (
  kind: 'table' | 'index' | 'database schema',
  name: string,
): void => {
  if (name.includes('.')) {
    throw new Error(
      `SQLite ${kind} names containing . are reserved for logical schema mapping`,
    );
  }
};

export const sqliteTableName = (
  identifier: Omit<SQLTableReference, 'sqlTokenType'>,
): string => {
  const { databaseSchemaName, tableName } = identifier;
  assertNativeName('table', tableName);

  if (databaseSchemaName === DefaultDatabaseSchemaName) return tableName;

  assertNativeName('database schema', databaseSchemaName);

  return `${databaseSchemaName}.${tableName}`;
};

export const sqliteIndexName = (
  identifier: Omit<SQLIndexReference, 'sqlTokenType'>,
): string => {
  const { databaseSchemaName, indexName } = identifier;
  assertNativeName('index', indexName);

  if (databaseSchemaName === DefaultDatabaseSchemaName) return indexName;

  assertNativeName('database schema', databaseSchemaName);

  return `${databaseSchemaName}.${indexName}`;
};
