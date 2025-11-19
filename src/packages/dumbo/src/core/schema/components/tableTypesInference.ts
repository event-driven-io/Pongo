import type { ColumnTypeToken } from '../../sql/tokens/columnTokens';
import type {
  AnyColumnSchemaComponent,
  ColumnSchemaComponent,
} from './columnSchemaComponent';
import type {
  AnyTableSchemaComponent,
  TableColumns,
  TableSchemaComponent,
} from './tableSchemaComponent';

export type InferColumnType<ColumnType> =
  ColumnType extends ColumnTypeToken<
    infer _JSType,
    infer _ColumnTypeName,
    infer _TProps,
    infer ValueType
  >
    ? ValueType
    : ColumnType;

export type TableColumnType<T extends AnyColumnSchemaComponent> =
  T extends ColumnSchemaComponent<infer ColumnType>
    ? T extends { notNull: true } | { primaryKey: true }
      ? InferColumnType<ColumnType>
      : InferColumnType<ColumnType> | null
    : unknown;

export type TableColumnNames<T extends AnyTableSchemaComponent> = Exclude<
  keyof T['columns'],
  keyof ReadonlyMap<string, AnyColumnSchemaComponent>
>;

export type InferTableRow<Columns extends TableColumns> = {
  [K in keyof Columns]: TableColumnType<Columns[K]>;
};

export type TableRowType<T extends AnyTableSchemaComponent> =
  T extends TableSchemaComponent<infer Columns>
    ? InferTableRow<Columns>
    : never;
