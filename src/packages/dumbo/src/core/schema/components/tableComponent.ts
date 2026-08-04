import {
  createSchemaComponent,
  mergeSchemaComponentMaps,
  schemaComponentMap,
  schemaComponentType,
  type AnySchemaComponent,
  type SchemaComponent,
  type SchemaComponentOptions,
} from '../schemaComponent';
import type { AnyColumnSchemaComponent } from './columnSchemaComponent';
import type { AnyDatabaseSchemaComponent } from './databaseSchemaComponent';
import type { AnyIndexComponent } from './indexComponent';
import type { TableRelationships } from './relationships/relationshipTypes';

export const tableComponentType: unique symbol = Symbol(
  'dumbo.schemaComponent.table',
);

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
    databaseSchemaName?: string | undefined;
    columns: Columns;
    primaryKey: ReadonlyArray<Extract<keyof Columns, string>>;
    relationships: Relationships;
    indexes: Indexes;
    schema: () => AnyDatabaseSchemaComponent | undefined;
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
  for (const index of Object.values(indexes)) {
    if (
      index.databaseSchemaName !== undefined &&
      options.databaseSchemaName !== undefined &&
      index.databaseSchemaName !== options.databaseSchemaName
    ) {
      throw new Error(
        `Index "${index.indexName}" is constrained to database schema "${index.databaseSchemaName}" and cannot be placed in "${options.databaseSchemaName}.${options.tableName}"`,
      );
    }
    if (
      index.tableName !== undefined &&
      index.tableName !== options.tableName
    ) {
      throw new Error(
        `Index "${index.indexName}" is constrained to table "${index.tableName}" and cannot be placed in "${options.tableName}"`,
      );
    }
  }
  const children = mergeSchemaComponentMaps(columns, indexes);
  const base = createSchemaComponent(
    tableComponentType,
    {
      components: children,
      migrations: options.migrations,
    },
    {
      tableName: options.tableName,
      databaseSchemaName: options.databaseSchemaName,
      primaryKey: Object.freeze([...(options.primaryKey ?? [])]),
      relationships: Object.freeze({
        ...(options.relationships ?? {}),
      }) as Relationships,
      columns: schemaComponentMap(columns),
      indexes: schemaComponentMap(indexes),
      schema(this: AnyTableComponent): AnyDatabaseSchemaComponent | undefined {
        return this.parent as AnyDatabaseSchemaComponent | undefined;
      },
    },
  );

  return base;
};

export const isTableComponent = (
  component: AnySchemaComponent,
): component is AnyTableComponent =>
  component[schemaComponentType] === tableComponentType;
