import { DefaultDatabaseSchemaName, SQLTableReference } from '../../sql';
import {
  schemaComponent,
  schemaComponentMap,
  schemaComponentType,
  type AnySchemaComponent,
  type SchemaComponent,
} from '../schemaComponent';
import { sqlMigration, type SQLMigration } from '../sqlMigration';
import type { AnyColumnSchemaComponent } from './columnSchemaComponent';
import { createTableSQL } from './createTableSQL';
import type { AnyIndexComponent } from './indexComponent';
import { migrationName, schemaSegments } from './migrationName';
import type { TableRelationships } from './relationships/relationshipTypes';

export const tableComponentType: unique symbol = Symbol(
  'dumbo.schemaComponent.table',
);

const tableMigrationName = (
  identifier: Readonly<{
    databaseSchemaName: string | undefined;
    tableName: string;
  }>,
  kind: string | undefined,
): string =>
  migrationName(
    'table',
    kind,
    [...schemaSegments(identifier.databaseSchemaName), identifier.tableName],
    'create',
  );

export const tableRenameMigrationName = (
  table: AnyTableComponent,
  newName: string,
): string =>
  migrationName(
    'table',
    table.kind,
    [
      ...schemaSegments(table.fullName.databaseSchemaName),
      table.tableName,
      newName,
    ],
    'rename',
  );

const generatedTableMigrations = (
  table: Readonly<{
    fullName: SQLTableReference;
    kind?: string | undefined;
    columns: TableColumns;
  }>,
): ReadonlyArray<SQLMigration> => {
  if (Object.keys(table.columns).length === 0) return [];

  return [
    sqlMigration(tableMigrationName(table.fullName, table.kind), [
      createTableSQL({
        columns: table.columns,
        fullName: table.fullName,
      }),
    ]),
  ];
};

export type TableColumns = Readonly<Record<string, AnyColumnSchemaComponent>>;
export type TableIndexes = Readonly<Record<string, AnyIndexComponent>>;

export type TableComponent<
  Columns extends TableColumns = TableColumns,
  TableName extends string = string,
  Indexes extends TableIndexes = TableIndexes,
  Relationships extends TableRelationships<keyof Columns & string> =
    TableRelationships<keyof Columns & string>,
> = SchemaComponent<typeof tableComponentType> &
  Readonly<{
    tableName: TableName;
    fullName: SQLTableReference;
    kind: string | undefined;
    columns: Columns;
    primaryKey: ReadonlyArray<Extract<keyof Columns, string>>;
    relationships: Relationships;
    indexes: Indexes;
    withDatabaseSchemaName: (
      databaseSchemaName: string,
    ) => TableComponent<Columns, TableName, Indexes, Relationships>;
    withTableName: <const NewTableName extends string>(
      tableName: NewTableName,
    ) => TableComponent<Columns, NewTableName, Indexes, Relationships>;
  }>;

export type AnyTableComponent = TableComponent<
  TableColumns,
  string,
  TableIndexes,
  TableRelationships<string>
>;

export type InferTableComponentColumns<T extends AnyTableComponent> =
  T extends TableComponent<infer Columns> ? Columns : never;

export type InferTableComponentData<T extends AnyTableComponent> =
  T extends TableComponent<
    infer Columns,
    infer TableName,
    infer Indexes,
    infer Relationships
  >
    ? {
        columns: Columns;
        tableName: TableName;
        indexes: Indexes;
        relationships: Relationships;
      }
    : never;

export type TableComponentOptions<
  Columns extends TableColumns,
  TableName extends string,
  Indexes extends TableIndexes,
  Relationships extends TableRelationships<keyof Columns & string>,
> = Readonly<{
  tableName: TableName;
  databaseSchemaName?: string | undefined;
  kind?: string | undefined;
  columns?: Columns | undefined;
  primaryKey?: ReadonlyArray<Extract<keyof Columns, string>> | undefined;
  relationships?: Relationships | undefined;
  indexes?: Indexes | undefined;
  migrations?:
    ((fullName: SQLTableReference) => ReadonlyArray<SQLMigration>) | undefined;
}>;

export const tableComponent = <
  const Columns extends TableColumns = TableColumns,
  const TableName extends string = string,
  const Indexes extends TableIndexes = TableIndexes,
  const Relationships extends TableRelationships<keyof Columns & string> =
    TableRelationships<keyof Columns & string>,
>(
  options: TableComponentOptions<Columns, TableName, Indexes, Relationships>,
): TableComponent<Columns, TableName, Indexes, Relationships> => {
  const columns = (options.columns ?? {}) as Columns;
  const fullName = SQLTableReference.from({
    databaseSchemaName: options.databaseSchemaName ?? DefaultDatabaseSchemaName,
    tableName: options.tableName,
  });
  const indexes = Object.fromEntries(
    Object.entries((options.indexes ?? {}) as Indexes).map(([key, index]) => [
      key,
      index.withTableReference(fullName),
    ]),
  ) as Indexes;
  const children = Object.freeze([
    ...Object.values(columns),
    ...Object.values(indexes),
  ]);
  const ownMigrations = () =>
    options.migrations !== undefined
      ? options.migrations(fullName)
      : generatedTableMigrations({
          fullName,
          kind: options.kind,
          columns,
        });

  const component: TableComponent<Columns, TableName, Indexes, Relationships> =
    {
      ...schemaComponent(tableComponentType, {
        components: children,
        migrations: ownMigrations,
      }),
      tableName: options.tableName,
      fullName,
      kind: options.kind,
      primaryKey: Object.freeze([...(options.primaryKey ?? [])]),
      relationships: Object.freeze({
        ...(options.relationships ?? {}),
      }) as Relationships,
      columns: schemaComponentMap(columns),
      indexes: schemaComponentMap(indexes),
      // spreading the receiver first keeps the properties outer factories
      // added to it, as Pongo does for its collection components
      withDatabaseSchemaName(databaseSchemaName: string) {
        if (fullName.databaseSchemaName === databaseSchemaName) return this;

        return {
          ...this,
          ...tableComponent({ ...options, databaseSchemaName }),
        };
      },
      withTableName<const NewTableName extends string>(
        tableName: NewTableName,
      ) {
        return {
          ...this,
          ...tableComponent<Columns, NewTableName, Indexes, Relationships>({
            ...options,
            tableName,
          }),
        };
      },
    };

  return component;
};

export const isTableComponent = (
  component: AnySchemaComponent,
): component is AnyTableComponent =>
  component[schemaComponentType] === tableComponentType;
