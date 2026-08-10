import {
  createTableSQL,
  SQL,
  SQLCreateSchema,
  SQLDefaultSchemaNameToken,
  SQLTableReference,
  type AnyTableComponent,
  type DatabaseSchemaIdentifier,
  type TableIdentifier,
} from '../../../../core';
import { postgreSQLMetadata } from './postgreSQLMetadata';

export const postgreSQLTableReference = (identifier: TableIdentifier): SQL =>
  SQL`${SQLTableReference.from(identifier)}`;

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
