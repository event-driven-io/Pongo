import {
  sqlMigration,
  type AnyIndexComponent,
  type AnyTableComponent,
  type DatabaseMigrationBuilder,
  type IndexIdentifier,
  type TableIdentifier,
} from '@event-driven-io/dumbo';
import {
  sqliteIndexSQL,
  sqliteMetadata,
  sqliteTableSQL,
} from '@event-driven-io/dumbo/sqlite';
import { isPongoCollectionComponent } from '../../../core';
import {
  pongoCollectionMigrationName,
  pongoIndexMigrationName,
} from '../../migrationNames';

const tableMigrations = (
  component: AnyTableComponent,
  identifier: TableIdentifier,
) => {
  if (!isPongoCollectionComponent(component)) return [];

  return [
    sqlMigration(
      pongoCollectionMigrationName(
        identifier,
        sqliteMetadata.defaultSchemaName,
      ),
      [sqliteTableSQL(component, identifier)],
    ),
  ];
};

const indexMigrations = (
  component: AnyIndexComponent,
  identifier: IndexIdentifier,
) => {
  return [
    sqlMigration(
      pongoIndexMigrationName(identifier),
      [sqliteIndexSQL(component, identifier)],
    ),
  ];
};

export const pongoSQLiteMigrationBuilder: DatabaseMigrationBuilder = {
  table: tableMigrations,
  index: indexMigrations,
};
