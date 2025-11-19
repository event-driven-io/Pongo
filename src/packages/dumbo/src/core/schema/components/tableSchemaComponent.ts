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
import type { TableColumnNames } from './tableTypesInference';

export type TableURNType = 'sc:dumbo:table';
export type TableURN = `${TableURNType}:${string}`;

export const TableURNType: TableURNType = 'sc:dumbo:table';
export const TableURN = ({ name }: { name: string }): TableURN =>
  `${TableURNType}:${name}`;

export type TableColumns = Record<string, AnyColumnSchemaComponent>;

export type TableSchemaComponent<Columns extends TableColumns = TableColumns> =
  SchemaComponent<
    TableURN,
    Readonly<{
      tableName: string;
      columns: ReadonlyMap<string, AnyColumnSchemaComponent> & Columns;
      primaryKey: TableColumnNames<TableSchemaComponent<Columns>>[];
      indexes: ReadonlyMap<string, IndexSchemaComponent>;
      addColumn: (column: AnyColumnSchemaComponent) => AnyColumnSchemaComponent;
      addIndex: (index: IndexSchemaComponent) => IndexSchemaComponent;
    }>
  >;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTableSchemaComponent = TableSchemaComponent<any>;

export const tableSchemaComponent = <
  Columns extends TableColumns = TableColumns,
>({
  tableName,
  columns,
  primaryKey,
  ...migrationsOrComponents
}: {
  tableName: string;
  columns?: Columns;
  primaryKey?: TableColumnNames<TableSchemaComponent<Columns>>[];
} & SchemaComponentOptions): TableSchemaComponent<Columns> => {
  columns ??= {} as Columns;

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
  };
};
