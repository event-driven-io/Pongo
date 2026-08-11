import type { AnyColumnTypeToken, SQLColumnToken } from '../../sql';
import {
  dedupeMigrations,
  schemaComponentType,
  type AnySchemaComponent,
  type SchemaComponent,
  type SchemaComponentContext,
  type SchemaComponentOptions,
} from '../schemaComponent';
import type { SQLMigration } from '../sqlMigration';

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
  const children: ReadonlyArray<AnySchemaComponent> = Object.freeze([]);

  const component = {
    [schemaComponentType]: columnComponentType,
    columnName,
    sqlTokenType: 'SQL_COLUMN',
    name: columnName,
    type,
    notNull,
    unique,
    primaryKey,
    default: defaultValue,
    components: children,
    migrations: (
      context: SchemaComponentContext = {},
    ): ReadonlyArray<SQLMigration> =>
      dedupeMigrations([
        ...(migrations?.(context) ?? []),
        ...children.flatMap((child) => child.migrations(context)),
      ]),
  };

  return component as unknown as ColumnSchemaComponent<ColumnType, ColumnName> &
    (Options extends { notNull: true } | { primaryKey: true }
      ? { notNull: true }
      : { notNull?: false });
};

export const isColumnSchemaComponent = (
  component: AnySchemaComponent,
): component is AnyColumnSchemaComponent =>
  component[schemaComponentType] === columnComponentType;
