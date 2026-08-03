import type { AnyColumnTypeToken, SQLColumnToken } from '../../sql';
import {
  createSchemaComponent,
  schemaComponentType,
  type AnySchemaComponent,
  type SchemaComponent,
  type SchemaComponentOptions,
} from '../schemaComponent';

export const columnComponentType: unique symbol = Symbol(
  'dumbo.schemaComponent.column',
);

export type ColumnSchemaComponent<
  ColumnType extends AnyColumnTypeToken | string = AnyColumnTypeToken | string,
  ColumnName extends string = string,
> = SchemaComponent<typeof columnComponentType> &
  Readonly<{ columnName: ColumnName }> &
  SQLColumnToken<ColumnType>;

export type AnyColumnSchemaComponent = ColumnSchemaComponent<
  AnyColumnTypeToken | string,
  string
>;

export type ColumnSchemaComponentOptions<
  ColumnType extends AnyColumnTypeToken | string = AnyColumnTypeToken | string,
> = Omit<SQLColumnToken<ColumnType>, 'name' | 'sqlTokenType'> &
  Omit<SchemaComponentOptions, 'components'>;

export const columnSchemaComponent = <
  const ColumnType extends AnyColumnTypeToken | string,
  const Options extends ColumnSchemaComponentOptions<ColumnType>,
  const ColumnName extends string,
>(
  params: { columnName: ColumnName } & Options,
): ColumnSchemaComponent<ColumnType, ColumnName> &
  (Options extends { notNull: true } | { primaryKey: true }
    ? { notNull: true }
    : { notNull?: false }) => {
  const {
    columnName,
    type,
    notNull,
    unique,
    primaryKey,
    default: defaultValue,
    migrations,
  } = params;
  const base = createSchemaComponent(
    columnComponentType,
    {
      migrations,
    },
    {
      columnName,
      sqlTokenType: 'SQL_COLUMN',
      name: columnName,
      type,
      notNull,
      unique,
      primaryKey,
      default: defaultValue,
    },
  );

  return base as unknown as ColumnSchemaComponent<ColumnType, ColumnName> &
    (Options extends { notNull: true } | { primaryKey: true }
      ? { notNull: true }
      : { notNull?: false });
};

export const isColumnSchemaComponent = (
  component: AnySchemaComponent,
): component is AnyColumnSchemaComponent =>
  component[schemaComponentType] === columnComponentType;
