import type { IndexIdentifier, TableIdentifier } from '../../../../core';
import { sqliteMetadata } from './sqliteMetadata';

const SQLiteMappedNamePrefix = 'dumbo_';

const escapeName = (name: string): string => name.replaceAll('_', '__');

const assertNativeName = (
  kind: 'table' | 'index',
  name: string,
  prefix: string,
): void => {
  if (name.startsWith(prefix)) {
    throw new Error(
      `SQLite ${kind} names starting with ${prefix} are reserved for logical schema mapping`,
    );
  }
};

export const sqliteTableName = (identifier: TableIdentifier): string => {
  const { databaseSchemaName, tableName } = identifier;
  if (databaseSchemaName === sqliteMetadata.defaultSchemaName) {
    assertNativeName('table', tableName, SQLiteMappedNamePrefix);
    return tableName;
  }

  return `${SQLiteMappedNamePrefix}${escapeName(databaseSchemaName)}_table_${escapeName(tableName)}`;
};

export const sqliteIndexName = (identifier: IndexIdentifier): string => {
  const { databaseSchemaName, indexName } = identifier;
  if (databaseSchemaName === sqliteMetadata.defaultSchemaName) {
    assertNativeName('index', indexName, SQLiteMappedNamePrefix);
    return indexName;
  }

  return `${sqliteTableName(identifier)}_index_${escapeName(indexName)}`;
};
