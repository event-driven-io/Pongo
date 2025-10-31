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

export type IndexURNType = 'sc:dumbo:index';
export type IndexURN = `${IndexURNType}:${string}`;

export type IndexSchemaComponent = SchemaComponent<
  IndexURN,
  Readonly<{
    indexName: string;
    columns: ReadonlyMap<string, ColumnSchemaComponent>;
    isUnique: boolean;
    addColumn: (
      column: string | ColumnSchemaComponent,
    ) => ColumnSchemaComponent;
  }>
>;

export const IndexURNType: IndexURNType = 'sc:dumbo:index';
export const IndexURN = ({ name }: { name: string }): IndexURN =>
  `${IndexURNType}:${name}`;

export const indexSchemaComponent = ({
  indexName,
  columnNames,
  isUnique,
  ...migrationsOrComponents
}: {
  indexName: string;
  columnNames: string[];
  isUnique: boolean;
} & SchemaComponentOptions): IndexSchemaComponent => {
  const columns = columnNames.map((columnName) =>
    columnSchemaComponent({ columnName }),
  );

  const sc = schemaComponent(IndexURN({ name: indexName }), {
    migrations: migrationsOrComponents.migrations ?? [],
    components: [...(migrationsOrComponents.components ?? []), ...columns],
  });

  return {
    ...sc,
    indexName,
    get columns() {
      return mapSchemaComponentsOfType<ColumnSchemaComponent>(
        sc.components,
        IndexURNType,
        (c) => c.columnName,
      );
    },
    addColumn: (column: string | ColumnSchemaComponent) =>
      sc.addComponent(
        typeof column === 'string'
          ? columnSchemaComponent({ columnName: column })
          : column,
      ),
    isUnique,
  };
};
