import type { SQLColumnToken } from '../../sql';
import {
  schemaComponent,
  type SchemaComponent,
  type SchemaComponentOptions,
} from '../schemaComponent';

export type ColumnURNType = 'sc:dumbo:column';
export type ColumnURN = `${ColumnURNType}:${string}`;

export const ColumnURNType: ColumnURNType = 'sc:dumbo:column';
export const ColumnURN = ({ name }: { name: string }): ColumnURN =>
  `${ColumnURNType}:${name}`;

export type ColumnSchemaComponent = SchemaComponent<
  ColumnURN,
  Readonly<{
    columnName: string;
  }>
>;
export const columnSchemaComponent = ({
  columnName,
  ...migrationsOrComponents
}: {
  columnName: string;
} & SchemaComponentOptions &
  Omit<SQLColumnToken, 'name' | 'sqlTokenType'>): ColumnSchemaComponent => {
  const sc = schemaComponent(
    ColumnURN({ name: columnName }),
    migrationsOrComponents,
  );

  return {
    ...sc,
    columnName,
  };
};
