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

export type ColumnSchemaComponentOptions<
  ColumnType extends AnyColumnTypeToken | string = AnyColumnTypeToken | string,
> = Omit<SQLColumnToken<ColumnType>, 'name' | 'sqlTokenType'> &
  SchemaComponentOptions;

export const columnSchemaComponent = <
  ColumnType extends AnyColumnTypeToken | string = AnyColumnTypeToken | string,
  TOptions extends
    ColumnSchemaComponentOptions<ColumnType> = ColumnSchemaComponentOptions<ColumnType>,
>(
  params: {
    columnName: string;
  } & TOptions,
): ColumnSchemaComponent<ColumnType> &
  (TOptions extends { notNull: true } | { primaryKey: true }
    ? { notNull: true }
    : { notNull?: false }) => {
  const {
    columnName,
    type,
    notNull,
    unique,
    primaryKey,
    default: defaultValue,
    ...schemaOptions
  } = params;

  const sc = schemaComponent(ColumnURN({ name: columnName }), schemaOptions);

  const result: Record<string, unknown> = {
    ...sc,
    columnName,
    notNull,
    unique,
    primaryKey,
    defaultValue,
    sqlTokenType: 'SQL_COLUMN',
    name: columnName,
    type,
  };

  return result as ColumnSchemaComponent<ColumnType> &
    (TOptions extends { notNull: true } | { primaryKey: true }
      ? { notNull: true }
      : { notNull?: false });
};
