import type { ColumnTypeToken } from '../sql/tokens/columnTokens';
import type { ColumnSchemaComponent } from './components/columnSchemaComponent';
import type {
  AnyTableSchemaComponent,
  TableColumns,
  TableSchemaComponent,
} from './components/tableSchemaComponent';

export type InferColumnValueType<ColumnType> =
  ColumnType extends ColumnTypeToken<
    infer ValueType,
    infer _ColumnTypeName,
    infer _TProps
  >
    ? ValueType
    : ColumnType;

export type InferColumnType<T extends ColumnSchemaComponent> =
  T extends ColumnSchemaComponent<infer ColumnType>
    ? T extends { notNull: true }
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
