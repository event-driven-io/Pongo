import { haveSameSQL, type SQLMigration } from '../sqlMigration';
import type { AnySchemaComponent } from '../schemaComponent';
import type { AnyDatabaseComponent } from './databaseComponent';
import {
  isDatabaseSchemaComponent,
  type AnyDatabaseSchemaComponent,
} from './databaseSchemaComponent';
import { isIndexComponent, type AnyIndexComponent } from './indexComponent';
import { isTableComponent, type AnyTableComponent } from './tableComponent';

export type DatabaseIdentifier = Readonly<{
  databaseName: string;
}>;

export type DatabaseSchemaIdentifier = DatabaseIdentifier &
  Readonly<{ databaseSchemaName: string }>;

export type TableIdentifier = DatabaseSchemaIdentifier &
  Readonly<{ tableName: string }>;

export type IndexIdentifier = TableIdentifier & Readonly<{ indexName: string }>;

export type DatabaseMigrationBuilder = Readonly<{
  databaseSchema?: (
    component: AnyDatabaseSchemaComponent,
    identifier: DatabaseSchemaIdentifier,
  ) => ReadonlyArray<SQLMigration>;
  table?: (
    component: AnyTableComponent,
    identifier: TableIdentifier,
  ) => ReadonlyArray<SQLMigration>;
  index?: (
    component: AnyIndexComponent,
    identifier: IndexIdentifier,
  ) => ReadonlyArray<SQLMigration>;
}>;

const addMigration = (
  result: SQLMigration[],
  migrationsByName: Map<string, SQLMigration>,
  migration: SQLMigration,
): void => {
  const previous = migrationsByName.get(migration.name);
  if (previous === undefined) {
    migrationsByName.set(migration.name, migration);
    result.push(migration);
  } else if (!haveSameSQL(previous, migration)) {
    throw new Error(
      `Duplicate migration name "${migration.name}" in schema component tree`,
    );
  }
};

export const databaseMigrations = (
  database: AnyDatabaseComponent,
  builder: DatabaseMigrationBuilder,
): ReadonlyArray<SQLMigration> => {
  if (database.databaseName === undefined) {
    throw new Error('A database name is required to build migrations');
  }

  const result: SQLMigration[] = [];
  const migrationsByName = new Map<string, SQLMigration>();
  const visited = new Set<AnySchemaComponent>();

  const databaseName = database.databaseName;

  const visit = (
    component: AnySchemaComponent,
    databaseSchemaName: string | undefined,
    tableName: string | undefined,
  ): void => {
    if (visited.has(component)) return;
    visited.add(component);

    for (const migration of { ...component, components: {} }.migrations()) {
      addMigration(result, migrationsByName, migration);
    }

    if (isDatabaseSchemaComponent(component))
      databaseSchemaName = component.schemaName;
    if (isTableComponent(component)) tableName = component.tableName;

    if (
      isDatabaseSchemaComponent(component) &&
      databaseSchemaName !== undefined
    ) {
      for (const migration of builder.databaseSchema?.(component, {
        databaseName,
        databaseSchemaName,
      }) ?? []) {
        addMigration(result, migrationsByName, migration);
      }
    } else if (
      isTableComponent(component) &&
      databaseSchemaName !== undefined
    ) {
      for (const migration of builder.table?.(component, {
        databaseName,
        databaseSchemaName,
        tableName: component.tableName,
      }) ?? []) {
        addMigration(result, migrationsByName, migration);
      }
    } else if (
      isIndexComponent(component) &&
      databaseSchemaName !== undefined &&
      tableName !== undefined
    ) {
      for (const migration of builder.index?.(component, {
        databaseName,
        databaseSchemaName,
        tableName,
        indexName: component.indexName,
      }) ?? []) {
        addMigration(result, migrationsByName, migration);
      }
    }

    for (const child of Object.values(component.components)) {
      visit(child, databaseSchemaName, tableName);
    }
  };

  visit(database, undefined, undefined);
  return result;
};
