import type { AnyColumnTypeToken, SQLColumnToken } from '../../sql';
import { schemaComponent, type SchemaComponent } from '../schemaComponent';
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
  Readonly<{
    migrations?: (() => ReadonlyArray<SQLMigration>) | undefined;
  }>;

export function columnSchemaComponent<
  const ColumnType extends AnyColumnTypeToken | string,
  const ColumnName extends string,
>(
  params: {
    columnName: ColumnName;
  } & ColumnSchemaComponentOptions<ColumnType> &
    ({ notNull: true } | { primaryKey: true }),
): ColumnSchemaComponent<ColumnType, ColumnName> & { notNull: true };
export function columnSchemaComponent<
  const ColumnType extends AnyColumnTypeToken | string,
  const ColumnName extends string,
>(
  params: { columnName: ColumnName } & ColumnSchemaComponentOptions<ColumnType>,
): ColumnSchemaComponent<ColumnType, ColumnName> & { notNull?: false };
export function columnSchemaComponent(
  params: { columnName: string } & ColumnSchemaComponentOptions,
) {
  const { columnName, migrations, ...column } = params;

  return {
    ...schemaComponent(columnComponentType, { migrations }),
    ...column,
    columnName,
    sqlTokenType: 'SQL_COLUMN',
    name: columnName,
  };
}
