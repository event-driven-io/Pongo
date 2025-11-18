import type { AnyColumnTypeToken, SQLColumnToken } from '../../sql';
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

export type ColumnSchemaComponent<
  ColumnType extends AnyColumnTypeToken | string = AnyColumnTypeToken | string,
> = SchemaComponent<
  ColumnURN,
  Readonly<{
    columnName: string;
  }>
> &
  SQLColumnToken<ColumnType>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyColumnSchemaComponent = ColumnSchemaComponent<any>;

export const columnSchemaComponent = <
  ColumnType extends AnyColumnTypeToken | string = AnyColumnTypeToken | string,
>({
  columnName,
  type,
  ...migrationsOrComponents
}: {
  columnName: string;
} & SchemaComponentOptions &
  Omit<
    SQLColumnToken<ColumnType>,
    'name' | 'sqlTokenType'
  >): ColumnSchemaComponent<ColumnType> => {
  const sc = schemaComponent(
    ColumnURN({ name: columnName }),
    migrationsOrComponents,
  );

  return {
    ...sc,
    columnName,
    sqlTokenType: 'SQL_COLUMN',
    name: columnName,
    type,
  };
};
