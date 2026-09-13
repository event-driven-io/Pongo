import type { AnyColumnTypeToken, SQLColumnToken } from '../../../sql';
import { schemaComponent, type SchemaComponent } from '../../schemaComponent';
import type { SQLMigration } from '../../sqlMigration';

export type ColumnSchemaComponent<
  ColumnType extends AnyColumnTypeToken | string = AnyColumnTypeToken | string,
  ColumnName extends string = string,
  Kind extends string | undefined = undefined,
> = SchemaComponent<'column', Kind> &
  Readonly<{ columnName: ColumnName }> &
  SQLColumnToken<ColumnType>;

export type AnyColumnSchemaComponent = ColumnSchemaComponent<
  AnyColumnTypeToken | string,
  string,
  string | undefined
>;

export type ColumnSchemaComponentOptions<
  ColumnType extends AnyColumnTypeToken | string = AnyColumnTypeToken | string,
  Kind extends string | undefined = undefined,
> = Omit<SQLColumnToken<ColumnType>, 'name' | 'sqlTokenType'> &
  Readonly<{
    kind?: Kind | undefined;
    migrations?: (() => ReadonlyArray<SQLMigration>) | undefined;
  }>;

export function columnSchemaComponent<
  const ColumnType extends AnyColumnTypeToken | string,
  const ColumnName extends string,
  const Kind extends string | undefined = undefined,
>(
  params: {
    columnName: ColumnName;
  } & ColumnSchemaComponentOptions<ColumnType, Kind> &
    ({ notNull: true } | { primaryKey: true }),
): ColumnSchemaComponent<ColumnType, ColumnName, Kind> & { notNull: true };
export function columnSchemaComponent<
  const ColumnType extends AnyColumnTypeToken | string,
  const ColumnName extends string,
  const Kind extends string | undefined = undefined,
>(
  params: { columnName: ColumnName } & ColumnSchemaComponentOptions<
    ColumnType,
    Kind
  >,
): ColumnSchemaComponent<ColumnType, ColumnName, Kind> & { notNull?: false };
export function columnSchemaComponent(
  params: { columnName: string } & ColumnSchemaComponentOptions<
    AnyColumnTypeToken | string,
    string | undefined
  >,
) {
  const { columnName, kind, migrations, ...column } = params;

  return {
    ...schemaComponent('column', { kind, migrations }),
    ...column,
    columnName,
    sqlTokenType: 'SQL_COLUMN',
    name: columnName,
  };
}
