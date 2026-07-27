import {
  mapSchemaComponentsOfType,
  schemaComponent,
  type SchemaComponent,
  type SchemaComponentOptions,
} from '../schemaComponent';
import {
  ColumnURNType,
  type AnyColumnSchemaComponent,
} from './columnSchemaComponent';
import {
  IndexURNType,
  type IndexSchemaComponent,
} from './indexSchemaComponent';
import type { TableRelationships } from './relationships/relationshipTypes';

export type TableURNType = 'sc:dumbo:table';
export type TableURN<
  TableKind extends string = string,
  DatabaseSchemaName extends string = string,
  TableName extends string = string,
> = `${TableURNType}:${TableKind}:${DatabaseSchemaName}:${TableName}`;

export const TableURNType: TableURNType = 'sc:dumbo:table';
export const TableURN = <
  const TableKind extends string = string,
  const DatabaseSchemaName extends string = string,
  const TableName extends string = string,
>({
  kind,
  databaseSchemaName,
  name,
}: {
  kind: TableKind;
  databaseSchemaName: DatabaseSchemaName;
  name: TableName;
}): TableURN<TableKind, DatabaseSchemaName, TableName> =>
  `${TableURNType}:${kind}:${databaseSchemaName}:${name}`;

export type TableColumns = Record<string, AnyColumnSchemaComponent>;
export type TableIndexes = Record<
  string,
  IndexSchemaComponent<string, string, Record<string, unknown>>
>;
export type RegularTableKind = 'regular';
export const RegularTableKind: RegularTableKind = 'regular';

export const DEFAULT_DATABASE_SCHEMA_NAME = '__default_database_schema__';

export const tableTypeState: unique symbol = Symbol('dumbo.tableTypeState');

export type TableTypeState<
  Columns extends TableColumns,
  TableName extends string,
  DatabaseSchemaName extends string,
  Relationships extends TableRelationships<string>,
  Indexes extends TableIndexes,
  TableKind extends string,
  AdditionalData extends Record<string, unknown>,
> = {
  columns: Columns;
  tableName: TableName;
  databaseSchemaName: DatabaseSchemaName;
  relationships: Relationships;
  indexes: Indexes;
  tableKind: TableKind;
  additionalData: AdditionalData;
};

export type TableSchemaComponent<
  Columns extends TableColumns = TableColumns,
  TableName extends string = string,
  DatabaseSchemaName extends string = string,
  Relationships extends TableRelationships<string> = {} & TableRelationships<
    keyof Columns & string
  >,
  Indexes extends TableIndexes = TableIndexes,
  TableKind extends string = RegularTableKind,
  AdditionalData extends Record<string, unknown> = Record<string, never>,
> = SchemaComponent<
  TableURN<TableKind, DatabaseSchemaName, TableName>,
  Readonly<{
    readonly [tableTypeState]: TableTypeState<
      Columns,
      TableName,
      DatabaseSchemaName,
      Relationships,
      Indexes,
      TableKind,
      AdditionalData
    >;
    tableKind: TableKind;
    tableName: TableName;
    databaseSchemaName: DatabaseSchemaName;
    columns: ReadonlyMap<string, AnyColumnSchemaComponent> & Columns;
    primaryKey: Exclude<
      keyof Columns,
      keyof ReadonlyMap<string, AnyColumnSchemaComponent>
    >[];
    relationships: Relationships;
    indexes: ReadonlyMap<string, IndexSchemaComponent> & Indexes;
    addColumn: (column: AnyColumnSchemaComponent) => AnyColumnSchemaComponent;
    addIndex: (index: IndexSchemaComponent) => IndexSchemaComponent;
  }> &
    AdditionalData
>;

export type InferTableSchemaComponentTypes<T extends AnyTableSchemaComponent> =
  T extends TableSchemaComponent<
    infer Columns extends TableColumns,
    infer TableName extends string,
    infer DatabaseSchemaName extends string,
    infer Relationships extends TableRelationships<string>,
    infer Indexes extends TableIndexes,
    infer TableKind extends string,
    infer AdditionalData extends Record<string, unknown>
  >
    ? [
        Columns,
        TableName,
        DatabaseSchemaName,
        Relationships,
        Indexes,
        TableKind,
        AdditionalData,
      ]
    : never;

export type InferTableSchemaComponentColumns<
  T extends AnyTableSchemaComponent,
> = InferTableSchemaComponentTypes<T>[0];

export type AnyTableSchemaComponent = TableSchemaComponent<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any
>;

export type InferTableTypeState<T> =
  T extends TableSchemaComponent<
    infer Columns extends TableColumns,
    infer TableName extends string,
    infer DatabaseSchemaName extends string,
    infer Relationships extends TableRelationships<string>,
    infer Indexes extends TableIndexes,
    infer TableKind extends string,
    infer AdditionalData extends Record<string, unknown>
  >
    ? TableTypeState<
        Columns,
        TableName,
        DatabaseSchemaName,
        Relationships,
        Indexes,
        TableKind,
        AdditionalData
      >
    : never;

export type BindTableToDatabaseSchema<
  Table extends AnyTableSchemaComponent,
  DatabaseSchemaName extends string,
> =
  InferTableTypeState<Table> extends TableTypeState<
    infer Columns extends TableColumns,
    infer TableName extends string,
    infer CurrentDatabaseSchemaName extends string,
    infer Relationships extends TableRelationships<string>,
    infer Indexes extends TableIndexes,
    infer TableKind extends string,
    infer AdditionalData extends Record<string, unknown>
  >
    ? CurrentDatabaseSchemaName extends typeof DEFAULT_DATABASE_SCHEMA_NAME
      ? TableSchemaComponent<
          Columns,
          TableName,
          DatabaseSchemaName,
          Relationships,
          Indexes,
          TableKind,
          AdditionalData
        >
      : string extends CurrentDatabaseSchemaName
        ? TableSchemaComponent<
            Columns,
            TableName,
            DatabaseSchemaName,
            Relationships,
            Indexes,
            TableKind,
            AdditionalData
          >
        : CurrentDatabaseSchemaName extends DatabaseSchemaName
          ? Table
          : never
    : never;

export type BindTablesToDatabaseSchema<
  Tables extends Record<string, AnyTableSchemaComponent>,
  DatabaseSchemaName extends string,
> = {
  [K in keyof Tables]: BindTableToDatabaseSchema<Tables[K], DatabaseSchemaName>;
};

export const tableSchemaComponent = <
  const Columns extends TableColumns = TableColumns,
  const TableName extends string = string,
  const DatabaseSchemaName extends string = typeof DEFAULT_DATABASE_SCHEMA_NAME,
  const Relationships extends TableRelationships<keyof Columns & string> =
    {} & TableRelationships<keyof Columns & string>,
  const Indexes extends TableIndexes = TableIndexes,
  const TableKind extends string = RegularTableKind,
  const AdditionalData extends Record<string, unknown> = Record<string, never>,
>({
  tableName,
  databaseSchemaName,
  tableKind,
  columns,
  primaryKey,
  relationships,
  indexes,
  additionalData,
  ...migrationsOrComponents
}: {
  tableName: TableName;
  databaseSchemaName?: DatabaseSchemaName;
  tableKind?: TableKind;
  columns?: Columns;
  primaryKey?: Exclude<
    keyof Columns,
    keyof ReadonlyMap<string, AnyColumnSchemaComponent>
  >[];
  relationships?: Relationships;
  indexes?: Indexes;
  additionalData?: AdditionalData;
} & SchemaComponentOptions): TableSchemaComponent<
  Columns,
  TableName,
  DatabaseSchemaName,
  Relationships,
  Indexes,
  TableKind,
  AdditionalData
> & {
  relationships: Relationships;
} => {
  columns ??= {} as Columns;
  relationships ??= {} as Relationships;
  indexes ??= {} as Indexes;
  additionalData ??= {} as AdditionalData;
  databaseSchemaName ??= DEFAULT_DATABASE_SCHEMA_NAME as DatabaseSchemaName;
  tableKind ??= RegularTableKind as TableKind;
  const indexComponents = Object.values(indexes);

  const base = schemaComponent(
    TableURN({ kind: tableKind, databaseSchemaName, name: tableName }),
    {
      migrations: migrationsOrComponents.migrations ?? [],
      components: [
        ...(migrationsOrComponents.components ?? []),
        ...Object.values(columns),
        ...indexComponents,
      ],
    },
  );

  return {
    ...base,
    ...additionalData,
    [tableTypeState]: {
      columns,
      tableName,
      databaseSchemaName,
      relationships,
      indexes,
      tableKind,
      additionalData,
    },
    tableKind,
    tableName,
    databaseSchemaName,
    primaryKey: primaryKey ?? [],
    relationships,
    get migrations() {
      return base.migrations;
    },
    get columns() {
      const columnsMap = mapSchemaComponentsOfType<AnyColumnSchemaComponent>(
        base.components,
        ColumnURNType,
        (c) => c.columnName,
      );

      return Object.assign(columnsMap, columns);
    },
    get indexes() {
      const indexesMap = mapSchemaComponentsOfType<
        IndexSchemaComponent<string, string, Record<string, unknown>>
      >(base.components, IndexURNType, (c) => c.indexName) as Map<
        string,
        IndexSchemaComponent<string, string, Record<string, unknown>>
      >;

      for (const [indexName, index] of Object.entries(indexes)) {
        indexesMap.set(indexName, index);
      }

      return Object.assign(indexesMap, indexes);
    },
    addColumn: (column: AnyColumnSchemaComponent) => base.addComponent(column),
    addIndex: (index: IndexSchemaComponent) => base.addComponent(index),
  } as unknown as TableSchemaComponent<
    Columns,
    TableName,
    DatabaseSchemaName,
    Relationships,
    Indexes,
    TableKind,
    AdditionalData
  > & {
    relationships: Relationships;
  };
};

export const bindTableToDatabaseSchema = <
  const Table extends AnyTableSchemaComponent,
  const DatabaseSchemaName extends string,
>(
  table: Table,
  databaseSchemaName: DatabaseSchemaName,
): BindTableToDatabaseSchema<Table, DatabaseSchemaName> => {
  /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
  const tableComponent = table as AnyTableSchemaComponent;

  if (
    tableComponent.databaseSchemaName !== DEFAULT_DATABASE_SCHEMA_NAME &&
    tableComponent.databaseSchemaName !== databaseSchemaName
  ) {
    throw new Error(
      `Table ${tableComponent.tableName} belongs to database schema ${tableComponent.databaseSchemaName} and cannot be added to ${databaseSchemaName}`,
    );
  }

  if (tableComponent.databaseSchemaName === databaseSchemaName) {
    return table as BindTableToDatabaseSchema<Table, DatabaseSchemaName>;
  }

  return {
    ...tableComponent,
    schemaComponentKey: TableURN({
      kind: tableComponent.tableKind,
      databaseSchemaName,
      name: tableComponent.tableName,
    }),
    databaseSchemaName,
    [tableTypeState]: {
      ...tableComponent[tableTypeState],
      databaseSchemaName,
    },
  } as BindTableToDatabaseSchema<Table, DatabaseSchemaName>;
  /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
};
