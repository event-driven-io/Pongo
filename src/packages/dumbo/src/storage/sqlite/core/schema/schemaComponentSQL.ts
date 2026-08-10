import {
  createTableSQL,
  SQL,
  SQLTableReference,
  type AnyTableComponent,
  type TableIdentifier,
} from '../../../../core';

export const sqliteTableReference = (identifier: TableIdentifier): SQL =>
  SQL`${SQLTableReference.from(identifier)}`;

export const sqliteTableSQL = (
  component: AnyTableComponent,
  identifier: TableIdentifier,
): SQL => createTableSQL(component, sqliteTableReference(identifier));
