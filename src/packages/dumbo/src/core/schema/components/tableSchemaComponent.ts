import {
  mapSchemaComponentsOfType,
  schemaComponent,
  type SchemaComponent,
  type SchemaComponentOptions,
} from '../schemaComponent';
import {
  ColumnURNType,
  type ColumnSchemaComponent,
} from './columnSchemaComponent';
import {
  IndexURNType,
  type IndexSchemaComponent,
} from './indexSchemaComponent';

export type TableURNType = 'sc:dumbo:table';
export type TableURN = `${TableURNType}:${string}`;

export const TableURNType: TableURNType = 'sc:dumbo:table';
export const TableURN = ({ name }: { name: string }): TableURN =>
  `${TableURNType}:${name}`;

export type TableColumns = Record<string, ColumnSchemaComponent>;

export type TableSchemaComponent<Columns extends TableColumns = TableColumns> =
  SchemaComponent<
    TableURN,
    Readonly<{
      tableName: string;
      columns: ReadonlyMap<string, ColumnSchemaComponent> & Columns;
      indexes: ReadonlyMap<string, IndexSchemaComponent>;
      addColumn: (column: ColumnSchemaComponent) => ColumnSchemaComponent;
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
  ...migrationsOrComponents
}: {
  tableName: string;
  columns?: Columns;
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
    get columns() {
      const columnsMap = mapSchemaComponentsOfType<ColumnSchemaComponent>(
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
    addColumn: (column: ColumnSchemaComponent) => base.addComponent(column),
    addIndex: (index: IndexSchemaComponent) => base.addComponent(index),
  };
};
