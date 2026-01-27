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
import type { TableColumnNames } from './tableTypesInference';

export type TableURNType = 'sc:dumbo:table';
export type TableURN = `${TableURNType}:${string}`;

export const TableURNType: TableURNType = 'sc:dumbo:table';
export const TableURN = ({ name }: { name: string }): TableURN =>
  `${TableURNType}:${name}`;

export type TableColumns = Record<string, AnyColumnSchemaComponent>;

export type TableSchemaComponent<
  Columns extends TableColumns = TableColumns,
  TableName extends string = string,
  Relationships extends TableRelationships<keyof Columns & string> =
    {} & TableRelationships<keyof Columns & string>,
> = SchemaComponent<
  TableURN,
  Readonly<{
    tableName: TableName;
    columns: ReadonlyMap<string, AnyColumnSchemaComponent> & Columns;
    primaryKey: TableColumnNames<
      TableSchemaComponent<Columns, TableName, Relationships>
    >[];
    relationships: Relationships;
    indexes: ReadonlyMap<string, IndexSchemaComponent>;
    addColumn: (column: AnyColumnSchemaComponent) => AnyColumnSchemaComponent;
    addIndex: (index: IndexSchemaComponent) => IndexSchemaComponent;
  }>
>;

export type InferTableSchemaComponentTypes<T extends AnyTableSchemaComponent> =
  T extends TableSchemaComponent<
    infer Columns,
    infer TableName,
    infer Relationships
  >
    ? [Columns, TableName, Relationships]
    : never;

export type InferTableSchemaComponentColumns<
  T extends AnyTableSchemaComponent,
> = InferTableSchemaComponentTypes<T>[0];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTableSchemaComponent = TableSchemaComponent<any, any, any>;

export const tableSchemaComponent = <
  const Columns extends TableColumns = TableColumns,
  const TableName extends string = string,
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  const Relationships extends TableRelationships<keyof Columns & string> = {},
>({
  tableName,
  columns,
  primaryKey,
  relationships,
  ...migrationsOrComponents
}: {
  tableName: TableName;
  columns?: Columns;
  primaryKey?: TableColumnNames<
    TableSchemaComponent<Columns, TableName, Relationships>
  >[];
  relationships?: Relationships;
} & SchemaComponentOptions): TableSchemaComponent<
  Columns,
  TableName,
  Relationships
> & {
  relationships: Relationships;
} => {
  columns ??= {} as Columns;
  relationships ??= {} as Relationships;

  const base = schemaComponent(TableURN({ name: tableName }), {
    migrations: migrationsOrComponents.migrations ?? [],
    components: [
      ...(migrationsOrComponents.components ?? []),
      ...Object.values(columns),
    ],
  });

  return {
    ...base,
    tableName,
    primaryKey: primaryKey ?? [],
    relationships,
    get columns() {
      const columnsMap = mapSchemaComponentsOfType<AnyColumnSchemaComponent>(
        base.components,
        ColumnURNType,
        (c) => c.columnName,
      );

      return Object.assign(columnsMap, columns);
    },
    get indexes() {
      return mapSchemaComponentsOfType<IndexSchemaComponent>(
        base.components,
        IndexURNType,
        (c) => c.indexName,
      );
    },
    addColumn: (column: AnyColumnSchemaComponent) => base.addComponent(column),
    addIndex: (index: IndexSchemaComponent) => base.addComponent(index),
  } as TableSchemaComponent<Columns, TableName, Relationships> & {
    relationships: Relationships;
  };
};
