import type { SQLMigration } from '../sqlMigration';
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
  if (previous !== undefined && previous !== migration) {
    throw new Error(
      `Duplicate migration name "${migration.name}" in schema component tree`,
    );
  }
  if (previous === undefined) {
    migrationsByName.set(migration.name, migration);
    result.push(migration);
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

  type Identifier =
    | DatabaseIdentifier
    | DatabaseSchemaIdentifier
    | TableIdentifier
    | IndexIdentifier;

  const identify = (
    component: AnySchemaComponent,
    parent: Identifier,
  ): Identifier => {
    if (isDatabaseSchemaComponent(component)) {
      if ('databaseSchemaName' in parent) return parent;
      if (component.schemaName === undefined) return parent;
      return {
        databaseName: parent.databaseName,
        databaseSchemaName: component.schemaName,
      };
    }

    if (isTableComponent(component)) {
      const databaseSchemaName =
        'databaseSchemaName' in parent
          ? parent.databaseSchemaName
          : component.databaseSchemaName;
      if (databaseSchemaName === undefined) return parent;
      return {
        databaseName: parent.databaseName,
        databaseSchemaName,
        tableName: component.tableName,
      };
    }

    if (isIndexComponent(component)) {
      if ('tableName' in parent) {
        return { ...parent, indexName: component.indexName };
      }
      if (
        component.databaseSchemaName !== undefined &&
        component.tableName !== undefined
      ) {
        return {
          databaseName: parent.databaseName,
          databaseSchemaName: component.databaseSchemaName,
          tableName: component.tableName,
          indexName: component.indexName,
        };
      }
    }

    return parent;
  };

  const visit = (
    component: AnySchemaComponent,
    parentIdentifier: Identifier,
  ): void => {
    if (visited.has(component)) return;
    visited.add(component);
    const identifier = identify(component, parentIdentifier);

    for (const migration of { ...component, components: {} }.migrations()) {
      addMigration(result, migrationsByName, migration);
    }

    if (
      isDatabaseSchemaComponent(component) &&
      'databaseSchemaName' in identifier
    ) {
      for (const migration of builder.databaseSchema?.(component, identifier) ??
        []) {
        addMigration(result, migrationsByName, migration);
      }
    } else if (
      isTableComponent(component) &&
      'databaseSchemaName' in identifier &&
      'tableName' in identifier
    ) {
      for (const migration of builder.table?.(component, identifier) ?? []) {
        addMigration(result, migrationsByName, migration);
      }
    } else if (
      isIndexComponent(component) &&
      'databaseSchemaName' in identifier &&
      'tableName' in identifier &&
      'indexName' in identifier
    ) {
      for (const migration of builder.index?.(component, identifier) ?? []) {
        addMigration(result, migrationsByName, migration);
      }
    }

    if (component === database) {
      for (const [databaseSchemaName, schema] of Object.entries(
        database.schemas,
      )) {
        visit(schema, {
          databaseName: identifier.databaseName,
          databaseSchemaName,
        });
      }
      for (const extension of Object.values(database.extensions)) {
        visit(extension, identifier);
      }
      return;
    }

    if (isDatabaseSchemaComponent(component)) {
      for (const table of Object.values(component.tables)) {
        visit(table, identifier);
      }
      for (const extension of Object.values(component.extensions)) {
        visit(extension, identifier);
      }
      return;
    }

    if (isTableComponent(component)) {
      for (const child of Object.values(component.columns)) {
        visit(child, identifier);
      }
      for (const index of Object.values(component.indexes)) {
        visit(index, identifier);
      }
      return;
    }

    for (const child of Object.values(component.components)) {
      visit(child, identifier);
    }
  };

  visit(database, { databaseName: database.databaseName });
  return result;
};
