import type { AnyColumnTypeToken, SQLColumnToken } from '../../sql';
import {
  schemaComponent,
  type SchemaComponent,
  type SchemaComponentOptions,
} from '../schemaComponent';

export type ColumnURNType = 'sc:dumbo:column';
export type ColumnURN<ColumnName extends string = string> =
  `${ColumnURNType}:${ColumnName}`;

export const ColumnURNType: ColumnURNType = 'sc:dumbo:column';
export const ColumnURN = <ColumnName extends string = string>({
  name,
}: {
  name: ColumnName;
}): ColumnURN<ColumnName> => `${ColumnURNType}:${name}`;

export type ColumnSchemaComponent<
  ColumnType extends AnyColumnTypeToken | string = AnyColumnTypeToken | string,
  ColumnName extends string = string,
> = SchemaComponent<
  ColumnURN<ColumnName>,
  Readonly<{
    columnName: ColumnName;
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
  const ColumnType extends AnyColumnTypeToken | string =
    | AnyColumnTypeToken
    | string,
  const TOptions extends
    ColumnSchemaComponentOptions<ColumnType> = ColumnSchemaComponentOptions<ColumnType>,
  const ColumnName extends string = string,
>(
  params: {
    columnName: ColumnName;
  } & TOptions,
): ColumnSchemaComponent<ColumnType, ColumnName> &
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

  return result as ColumnSchemaComponent<ColumnType, ColumnName> &
    (TOptions extends { notNull: true } | { primaryKey: true }
      ? { notNull: true }
      : { notNull?: false });
};
