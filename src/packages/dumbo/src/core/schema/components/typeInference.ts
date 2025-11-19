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

export type InferColumnValueType<ColumnType> =
  ColumnType extends ColumnTypeToken<
    infer _JSType,
    infer _ColumnTypeName,
    infer _TProps,
    infer ValueType
  >
    ? ValueType
    : ColumnType;

export type InferColumnType<T extends AnyColumnSchemaComponent> =
  T extends ColumnSchemaComponent<infer ColumnType>
    ? T extends { notNull: true } | { primaryKey: true }
      ? InferColumnValueType<ColumnType>
      : InferColumnValueType<ColumnType> | null
    : unknown;

export type InferTableRow<Columns extends TableColumns> = {
  [K in keyof Columns]: InferColumnType<Columns[K]>;
};

export type InferTableType<T extends AnyTableSchemaComponent> =
  T extends TableSchemaComponent<infer Columns>
    ? InferTableRow<Columns>
    : never;
