import {
  mapSchemaComponentsOfType,
  schemaComponent,
  type SchemaComponent,
  type SchemaComponentOptions,
} from '../schemaComponent';
import {
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

  const sc = schemaComponent(TableURN({ name: tableName }), {
    migrations: migrationsOrComponents.migrations ?? [],
    components: [...(migrationsOrComponents.components ?? []), ...columns],
  });

  return {
    ...sc,
    tableName,
    get columns() {
      return mapSchemaComponentsOfType<ColumnSchemaComponent>(
        sc.components,
        TableURNType,
        (c) => c.columnName,
      );
    },
    get indexes() {
      return mapSchemaComponentsOfType<IndexSchemaComponent>(
        sc.components,
        IndexURNType,
        (c) => c.indexName,
      );
    },
  };
};
