import type { ColumnTypeToken } from '../../sql/tokens/columnTokens';
import type {
  AnyColumnSchemaComponent,
  ColumnSchemaComponent,
} from './columnSchemaComponent';
import type {
  AnyDatabaseComponent,
  DatabaseComponent,
} from './databaseComponent';
import type {
  AnyDatabaseSchemaComponent,
  DatabaseSchemaComponent,
} from './databaseSchemaComponent';
import type {
  AnyTableComponent,
  TableColumns,
  TableComponent,
} from './tableComponent';

export type Writable<T> = {
  -readonly [P in keyof T]: T[P];
};

export type InferColumnType<ColumnType> =
  ColumnType extends ColumnTypeToken<
    infer _JSType,
    infer _ColumnTypeName,
    infer _TProps,
    infer ValueType
  >
    ? ValueType
    : ColumnType;

export type TableColumnType<T extends AnyColumnSchemaComponent> = T extends {
  type: infer ColumnType extends ColumnSchemaComponent['type'] | string;
}
  ? T extends { notNull: true } | { primaryKey: true }
    ? InferColumnType<ColumnType>
    : InferColumnType<ColumnType> | null
  : unknown;

export type TableColumnNames<T extends AnyTableComponent> = Extract<
  Exclude<
    T extends TableComponent<infer Columns> ? keyof Columns : never,
    keyof ReadonlyMap<string, AnyColumnSchemaComponent>
  >,
  string
>;

export type InferTableRow<Columns extends TableColumns> = Writable<{
  [K in keyof Columns]: TableColumnType<Columns[K]>;
}>;

export type TableRowType<T extends AnyTableComponent> =
  T extends TableComponent<infer Columns> ? InferTableRow<Columns> : never;

export type InferSchemaTables<T extends AnyDatabaseSchemaComponent> =
  T extends DatabaseSchemaComponent<infer Tables> ? Tables : never;

export type InferDatabaseSchemas<T extends AnyDatabaseComponent> =
  T extends DatabaseComponent<infer _DatabaseName, infer _Tables, infer Schemas>
    ? Schemas
    : never;
