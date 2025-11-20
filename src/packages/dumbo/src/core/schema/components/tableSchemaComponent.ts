import {
  mapSchemaComponentsOfType,
  schemaComponent,
  type SchemaComponent,
  type SchemaComponentOptions,
} from '../schemaComponent';
import {
  ColumnURNType,
  type AnyColumnSchemaComponent,
} from './columnSchemaComponent';
import type { ForeignKeyDefinition } from './foreignKeys/foreignKeyTypes';
import {
  IndexURNType,
  type IndexSchemaComponent,
} from './indexSchemaComponent';
import type { TableColumnNames } from './tableTypesInference';

export type TableURNType = 'sc:dumbo:table';
export type TableURN = `${TableURNType}:${string}`;

export const TableURNType: TableURNType = 'sc:dumbo:table';
export const TableURN = ({ name }: { name: string }): TableURN =>
  `${TableURNType}:${name}`;

export type TableColumns = Record<string, AnyColumnSchemaComponent>;
export type TableForeignKeys<
  Columns extends string = string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  FKS extends ForeignKeyDefinition<Columns, any> = ForeignKeyDefinition<
    Columns,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >,
> =
  FKS extends ForeignKeyDefinition<infer C, infer R>
    ? readonly ForeignKeyDefinition<C, R>[]
    : never;

export type TableSchemaComponent<
  Columns extends TableColumns = TableColumns,
  ForeignKeys extends TableForeignKeys<
    keyof Columns & string
  > = TableForeignKeys<keyof Columns & string>,
> = SchemaComponent<
  TableURN,
  Readonly<{
    tableName: string;
    columns: ReadonlyMap<string, AnyColumnSchemaComponent> & Columns;
    primaryKey: TableColumnNames<TableSchemaComponent<Columns, ForeignKeys>>[];
    foreignKeys: ForeignKeys;
    indexes: ReadonlyMap<string, IndexSchemaComponent>;
    addColumn: (column: AnyColumnSchemaComponent) => AnyColumnSchemaComponent;
    addIndex: (index: IndexSchemaComponent) => IndexSchemaComponent;
  }>
>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTableSchemaComponent = TableSchemaComponent<any, any>;

export const tableSchemaComponent = <
  Columns extends TableColumns = TableColumns,
  const ForeignKeys extends TableForeignKeys = TableForeignKeys,
>({
  tableName,
  columns,
  primaryKey,
  foreignKeys,
  ...migrationsOrComponents
}: {
  tableName: string;
  columns?: Columns;
  primaryKey?: TableColumnNames<TableSchemaComponent<Columns, ForeignKeys>>[];
  foreignKeys?: ForeignKeys;
} & SchemaComponentOptions): TableSchemaComponent<Columns, ForeignKeys> & {
  foreignKeys: ForeignKeys;
} => {
  columns ??= {} as Columns;
  foreignKeys ??= {} as ForeignKeys;

  const base = schemaComponent(TableURN({ name: tableName }), {
    migrations: migrationsOrComponents.migrations ?? [],
    components: [
      ...(migrationsOrComponents.components ?? []),
      ...Object.values(columns),
    ],
  });

  return {
    ...base,
    tableName,
    primaryKey: primaryKey ?? [],
    foreignKeys,
    get columns() {
      const columnsMap = mapSchemaComponentsOfType<AnyColumnSchemaComponent>(
        base.components,
        ColumnURNType,
        (c) => c.columnName,
      );

      return Object.assign(columnsMap, columns);
    },
    get indexes() {
      return mapSchemaComponentsOfType<IndexSchemaComponent>(
        base.components,
        IndexURNType,
        (c) => c.indexName,
      );
    },
    addColumn: (column: AnyColumnSchemaComponent) => base.addComponent(column),
    addIndex: (index: IndexSchemaComponent) => base.addComponent(index),
  } as TableSchemaComponent<Columns, ForeignKeys> & {
    foreignKeys: ForeignKeys;
  };
};
