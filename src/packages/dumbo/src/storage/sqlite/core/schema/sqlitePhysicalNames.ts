import {
  SQLDefaultSchemaNameToken,
  type SQLIndexReference,
  type SQLTableReference,
} from '../../../../core';

const assertNativeName = (kind: 'table' | 'index', name: string): void => {
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
  if (SQLDefaultSchemaNameToken.check(databaseSchemaName)) {
    assertNativeName('table', tableName);
    return tableName;
  }

  return `${databaseSchemaName}.${tableName}`;
};

export const sqliteIndexName = (
  identifier: Omit<SQLIndexReference, 'sqlTokenType'>,
): string => {
  const { databaseSchemaName, indexName } = identifier;
  if (SQLDefaultSchemaNameToken.check(databaseSchemaName)) {
    assertNativeName('index', indexName);
    return indexName;
  }

  return `${databaseSchemaName}.${indexName}`;
};
