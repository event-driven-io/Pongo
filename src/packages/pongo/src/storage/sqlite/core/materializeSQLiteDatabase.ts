import {
  createTableSQL,
  SQL,
  sqlMigration,
  type AnySchemaComponent,
  type ComponentContext,
  type DatabaseDriverType,
  type JSONSerializer,
} from '@event-driven-io/dumbo';
import { SQLiteJSON } from '@event-driven-io/dumbo/sqlite';
import {
  isPongoCollectionComponent,
  isPongoIndexComponent,
  materializePongoDatabaseComponent,
  pongoIndexStrategy,
  pongoJsonDocumentIndex,
  type PongoDatabaseComponent,
  type PongoRuntimeDatabaseComponent,
} from '../../../core';
import {
  resolveSQLiteCollectionReference,
  resolveSQLiteIndexReference,
} from './schemaMapping';
import { sqliteSQLBuilder } from './sqlBuilder';

const migrationsFor = (
  component: AnySchemaComponent,
  context: ComponentContext,
) => {
  if (isPongoCollectionComponent(component)) {
    const collection = resolveSQLiteCollectionReference(context);
    return [
      sqlMigration(
        `pongoCollection:${collection.migrationName}:001:createtable`,
        [createTableSQL(component, collection.tableReference)],
      ),
    ];
  }

  if (!isPongoIndexComponent(component)) return [];

  if (
    context.databaseSchemaName === undefined ||
    context.tableName === undefined
  ) {
    throw new Error(
      'SQLite index migration requires a materialized table context',
    );
  }

  const { tableReference } = resolveSQLiteCollectionReference(context);
  const { indexReference } = resolveSQLiteIndexReference(
    context,
    component.indexName,
  );
  const path =
    typeof component.path === 'string'
      ? component.path
      : component.path?.join('.');
  const indexContext = {
    databaseName: context.databaseName,
    databaseSchemaName: context.databaseSchemaName,
    tableName: context.tableName,
    indexName: component.indexName,
    tableReference,
    indexReference,
  };
  const sql =
    component.sql?.(indexContext) ??
    (component[pongoIndexStrategy] === pongoJsonDocumentIndex
      ? SQL`CREATE INDEX ${indexReference} ON ${tableReference} (data)`
      : component.isUnique
        ? SQL`CREATE UNIQUE INDEX ${indexReference} ON ${tableReference} (json_extract(data, ${SQLiteJSON.path(path ?? component.indexTargetNames.join('.'))}))`
        : SQL`CREATE INDEX ${indexReference} ON ${tableReference} (json_extract(data, ${SQLiteJSON.path(path ?? component.indexTargetNames.join('.'))}))`);

  return [
    sqlMigration(
      `pongoIndex:${context.databaseSchemaName}:${context.tableName}:${component.indexName}:create`,
      [sql],
    ),
  ];
};

export const materializePongoSQLiteDatabaseComponent = <
  DriverType extends DatabaseDriverType,
>(options: {
  driverType: DriverType;
  databaseName: string;
  defaultSchemaName: string;
  definition?: PongoDatabaseComponent | undefined;
  serializer: JSONSerializer;
}): PongoRuntimeDatabaseComponent<DriverType> =>
  materializePongoDatabaseComponent({
    driverType: options.driverType,
    databaseName: options.databaseName,
    defaultSchemaName: options.defaultSchemaName,
    definition: options.definition,
    migrationsFor,
    sqlBuilderFor: (collection, context) =>
      sqliteSQLBuilder(collection, context, options.serializer),
  });
