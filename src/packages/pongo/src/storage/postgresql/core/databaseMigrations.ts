import {
  sqlMigration,
  type AnyDatabaseSchemaComponent,
  type AnyIndexComponent,
  type AnyTableComponent,
  type DatabaseMigrationBuilder,
  type DatabaseSchemaIdentifier,
  type IndexIdentifier,
  type TableIdentifier,
} from '@event-driven-io/dumbo';
import {
  postgreSQLDatabaseSchemaSQL,
  postgreSQLIndexSQL,
  postgreSQLMetadata,
  postgreSQLTableSQL,
} from '@event-driven-io/dumbo/postgresql';
import { isPongoCollectionComponent } from '../../../core';
import {
  pongoCollectionMigrationName,
  pongoDatabaseSchemaMigrationName,
  pongoIndexMigrationName,
} from '../../migrationNames';

const schemaMigrations = (
  _schema: AnyDatabaseSchemaComponent,
  identifier: DatabaseSchemaIdentifier,
) => {
  const sql = postgreSQLDatabaseSchemaSQL(identifier);
  if (sql === undefined) return [];

  return [sqlMigration(pongoDatabaseSchemaMigrationName(identifier), [sql])];
};

const tableMigrations = (
  component: AnyTableComponent,
  identifier: TableIdentifier,
) => {
  if (!isPongoCollectionComponent(component)) return [];

  return [
    sqlMigration(
      pongoCollectionMigrationName(
        identifier,
        postgreSQLMetadata.defaultSchemaName,
      ),
      [postgreSQLTableSQL(component, identifier)],
    ),
  ];
};

const indexMigrations = (
  component: AnyIndexComponent,
  identifier: IndexIdentifier,
) => [
  sqlMigration(pongoIndexMigrationName(identifier), [
    postgreSQLIndexSQL(component, identifier),
  ]),
];

export const pongoPostgreSQLMigrationBuilder: DatabaseMigrationBuilder = {
  databaseSchema: schemaMigrations,
  table: tableMigrations,
  index: indexMigrations,
};
