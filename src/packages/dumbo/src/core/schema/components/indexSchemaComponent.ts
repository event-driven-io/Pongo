import {
  schemaComponent,
  type SchemaComponent,
  type SchemaComponentOptions,
} from '../schemaComponent';
import { type ColumnSchemaComponent } from './columnSchemaComponent';

export type IndexURNType = 'sc:dumbo:index';
export type IndexURN = `${IndexURNType}:${string}`;

export type IndexSchemaComponent = SchemaComponent<
  IndexURN,
  Readonly<{
    indexName: string;
    columnNames: ReadonlyArray<string>;
    isUnique: boolean;
    addColumn: (column: string | ColumnSchemaComponent) => void;
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
  const sc = schemaComponent(IndexURN({ name: indexName }), {
    migrations: migrationsOrComponents.migrations ?? [],
    components: [...(migrationsOrComponents.components ?? [])],
  });

  return {
    ...sc,
    indexName,
    get columnNames() {
      return columnNames;
    },
    addColumn: (column: string | ColumnSchemaComponent) =>
      columnNames.push(typeof column === 'string' ? column : column.columnName),
    isUnique,
  };
};
