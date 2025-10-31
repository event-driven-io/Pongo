import {
  mapSchemaComponentsOfType,
  schemaComponent,
  type SchemaComponent,
  type SchemaComponentOptions,
} from '../schemaComponent';
import {
  ColumnURNType,
  columnSchemaComponent,
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

export type TableSchemaComponent = SchemaComponent<
  TableURN,
  Readonly<{
    tableName: string;
    columns: ReadonlyMap<string, ColumnSchemaComponent>;
    indexes: ReadonlyMap<string, IndexSchemaComponent>;
    addColumn: (
      column: string | ColumnSchemaComponent,
    ) => ColumnSchemaComponent;
    addIndex: (index: IndexSchemaComponent) => IndexSchemaComponent;
  }>
>;

export const tableSchemaComponent = ({
  tableName,
  columnNames,
  ...migrationsOrComponents
}: {
  tableName: string;
  columnNames?: string[];
} & SchemaComponentOptions): TableSchemaComponent => {
  const columns =
    columnNames?.map((columnName) => columnSchemaComponent({ columnName })) ??
    [];

  const base = schemaComponent(TableURN({ name: tableName }), {
    migrations: migrationsOrComponents.migrations ?? [],
    components: [...(migrationsOrComponents.components ?? []), ...columns],
  });

  return {
    ...base,
    tableName,
    get columns() {
      return mapSchemaComponentsOfType<ColumnSchemaComponent>(
        base.components,
        ColumnURNType,
        (c) => c.columnName,
      );
    },
    get indexes() {
      return mapSchemaComponentsOfType<IndexSchemaComponent>(
        base.components,
        IndexURNType,
        (c) => c.indexName,
      );
    },
    addColumn: (column: string | ColumnSchemaComponent) =>
      base.addComponent(
        typeof column === 'string'
          ? columnSchemaComponent({ columnName: column })
          : column,
      ),
    addIndex: (index: IndexSchemaComponent) => base.addComponent(index),
  };
};
