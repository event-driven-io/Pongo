import {
  copySchemaComponentSpecialization,
  createSchemaComponent,
  defineSchemaComponentRecord,
  localMigrationsOf,
  mergeComponentRecords,
  schemaComponentType,
  type AnySchemaComponent,
  type SchemaComponent,
  type SchemaComponentOptions,
} from '../schemaComponent';
import type { AnyColumnSchemaComponent } from './columnSchemaComponent';
import {
  contextualIndexComponent,
  type AnyIndexComponent,
} from './indexComponent';
import type { TableRelationships } from './relationships/relationshipTypes';

export const tableComponentType: unique symbol = Symbol(
  'dumbo.schemaComponent.table',
);

export type TableColumns = Readonly<Record<string, AnyColumnSchemaComponent>>;
export type TableIndexes = Readonly<Record<string, AnyIndexComponent>>;

type ContextualIndexes<Indexes extends TableIndexes> = {
  readonly [Key in keyof Indexes]: Indexes[Key] & {
    databaseSchemaName?: string;
    tableName: string;
  };
};

export type TableComponent<
  Columns extends TableColumns = TableColumns,
  TableName extends string = string,
  Indexes extends TableIndexes = TableIndexes,
  Relationships extends TableRelationships<keyof Columns & string> =
    TableRelationships<keyof Columns & string>,
> = SchemaComponent<typeof tableComponentType> &
  Readonly<{
    tableName: TableName;
    databaseSchemaName?: string;
    columns: Columns;
    primaryKey: ReadonlyArray<Extract<keyof Columns, string>>;
    relationships: Relationships;
    indexes: ContextualIndexes<Indexes>;
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
  columns?: Columns | undefined;
  primaryKey?: ReadonlyArray<Extract<keyof Columns, string>> | undefined;
  relationships?: Relationships | undefined;
  indexes?: Indexes | undefined;
}> &
  Omit<SchemaComponentOptions, 'components'>;

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
  const indexes = (options.indexes ?? {}) as Indexes;
  const contextualIndexes = Object.fromEntries(
    Object.entries(indexes).map(([alias, index]) => [
      alias,
      contextualIndexComponent(index, {
        tableName: options.tableName,
        databaseSchemaName: options.databaseSchemaName,
      }),
    ]),
  ) as ContextualIndexes<Indexes>;
  const children = mergeComponentRecords(columns, contextualIndexes);
  const base = createSchemaComponent(tableComponentType, {
    components: children,
    migrations: options.migrations,
  });

  Object.defineProperties(base, {
    tableName: { value: options.tableName, enumerable: true },
    databaseSchemaName: {
      value: options.databaseSchemaName,
      enumerable: true,
    },
    primaryKey: {
      value: Object.freeze([...(options.primaryKey ?? [])]),
      enumerable: true,
    },
    relationships: {
      value: Object.freeze({ ...(options.relationships ?? {}) }),
      enumerable: true,
    },
  });
  defineSchemaComponentRecord(base, 'columns', columns);
  defineSchemaComponentRecord(base, 'indexes', contextualIndexes);

  return base as unknown as TableComponent<
    Columns,
    TableName,
    Indexes,
    Relationships
  >;
};

export const contextualTableComponent = <Table extends AnyTableComponent>(
  table: Table,
  databaseSchemaName: string,
): Table & { databaseSchemaName: string } => {
  if (
    table.databaseSchemaName !== undefined &&
    table.databaseSchemaName !== databaseSchemaName
  ) {
    throw new Error(
      `Table "${table.tableName}" is constrained to database schema "${table.databaseSchemaName}" and cannot be placed in "${databaseSchemaName}"`,
    );
  }

  const contextual = tableComponent({
    tableName: table.tableName,
    databaseSchemaName,
    columns: table.columns,
    primaryKey: table.primaryKey,
    relationships: table.relationships,
    indexes: table.indexes,
    migrations: localMigrationsOf(table),
  });
  copySchemaComponentSpecialization(table, contextual, tableProperties);
  return contextual as unknown as Table & { databaseSchemaName: string };
};

const tableProperties = new Set<PropertyKey>([
  schemaComponentType,
  'components',
  'migrations',
  'tableName',
  'databaseSchemaName',
  'columns',
  'primaryKey',
  'relationships',
  'indexes',
]);

export const isTableComponent = (
  component: AnySchemaComponent,
): component is AnyTableComponent =>
  component[schemaComponentType] === tableComponentType;
