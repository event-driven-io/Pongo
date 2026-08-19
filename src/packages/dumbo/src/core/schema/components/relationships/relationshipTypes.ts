import type {
  AnyDatabaseSchemaComponent,
  AnyTableComponent,
  DatabaseComponent,
  DatabaseSchemaComponent,
  DatabaseSchemas,
  DatabaseSchemaTables,
  TableColumnNames,
  TableColumns,
  TableComponent,
  Writable,
} from '..';
import type { ColumnTypeToken } from '../../../sql/tokens/columnTokens';
import type { DefaultDatabaseSchemaName } from '../../../sql/tokens/sqlToken';
import type { NotEmptyTuple } from '../../../typing';

export type ExtractSchemaNames<DB> =
  DB extends DatabaseComponent<
    infer _DatabaseName,
    infer _Tables,
    infer Schemas extends DatabaseSchemas
  >
    ? keyof Schemas
    : never;

export type ExtractTableNames<Schema extends AnyDatabaseSchemaComponent> =
  Schema extends DatabaseSchemaComponent<
    infer Tables extends DatabaseSchemaTables
  >
    ? keyof Tables
    : never;

export type ExtractColumnNames<Table extends AnyTableComponent> =
  Table extends TableComponent<infer Columns extends TableColumns>
    ? TableColumnNames<TableComponent<Columns>>
    : never;

export type ExtractColumnTypeName<T> =
  T extends ColumnTypeToken<
    infer _JSType,
    infer TypeName,
    infer _Props,
    infer _ValueType
  >
    ? Uppercase<TypeName>
    : never;

export type AllColumnTypes<Schemas extends DatabaseSchemas> = {
  [
    SchemaName in keyof Schemas
  ]: Schemas[SchemaName] extends DatabaseSchemaComponent<infer Tables>
    ? Writable<{
        [TableName in keyof Tables]: Tables[TableName] extends TableComponent<
          infer Columns
        >
          ? Writable<{
              [ColumnName in keyof Columns]: {
                columnTypeName: ExtractColumnTypeName<
                  Columns[ColumnName]['type']
                >;
              };
            }>
          : never;
      }>
    : never;
};

export type AllColumnReferences<Schemas extends DatabaseSchemas> = {
  [
    SchemaName in keyof Schemas
  ]: Schemas[SchemaName] extends DatabaseSchemaComponent<infer Tables>
    ? {
        [TableName in keyof Tables]: Tables[TableName] extends TableComponent<
          infer Columns
        >
          ? {
              [ColumnName in keyof Columns]: `${SchemaName &
                string}.${TableName & string}.${ColumnName & string}`;
            }[keyof Columns]
          : never;
      }[keyof Tables]
    : never;
}[keyof Schemas];

export type AllColumnTypesInSchema<Schema extends AnyDatabaseSchemaComponent> =
  Schema extends DatabaseSchemaComponent<infer Tables>
    ? {
        [TableName in keyof Tables]: Tables[TableName] extends TableComponent<
          infer Columns
        >
          ? {
              [ColumnName in keyof Columns]: {
                columnTypeName: ExtractColumnTypeName<
                  Columns[ColumnName]['type']
                >;
              };
            }
          : never;
      }
    : never;

export type AllColumnReferencesInSchema<
  Schema extends AnyDatabaseSchemaComponent,
  SchemaName extends string,
> =
  Schema extends DatabaseSchemaComponent<infer Tables>
    ? {
        [TableName in keyof Tables]: Tables[TableName] extends TableComponent<
          infer Columns
        >
          ? {
              [
                ColumnName in keyof Columns
              ]: `${SchemaName & string}.${TableName &
                string}.${ColumnName & string}`;
            }[keyof Columns]
          : never;
      }[keyof Tables]
    : never;

/**
 * Key under which the nameless default schema is registered. The default schema
 * has no name to qualify references with, so it is looked up by a well-known key
 * instead.
 */
export type DefaultSchemaKey = DefaultDatabaseSchemaName;

export type DatabaseSchemaKey<SchemaName extends string> = [
  Extract<SchemaName, string>,
] extends [never]
  ? DefaultSchemaKey
  : Extract<SchemaName, string>;

type QualifyColumnName<
  SchemaKey extends string,
  TableName extends string,
  ColName extends string,
> = SchemaKey extends DefaultSchemaKey
  ? TableColumnName<TableName, ColName>
  : SchemaColumnName<SchemaKey, TableName, ColName>;

export type NormalizeReference<
  Path extends string,
  CurrentSchemaKey extends string,
  CurrentTable extends string,
> = Path extends `${infer Schema}.${infer Table}.${infer Column}`
  ? `${Schema}.${Table}.${Column}`
  : Path extends `${infer Table}.${infer Column}`
    ? QualifyColumnName<CurrentSchemaKey, Table, Column>
    : Path extends string
      ? QualifyColumnName<CurrentSchemaKey, CurrentTable, Path>
      : never;

export type NormalizeColumnPath<
  References extends readonly string[],
  SchemaKey extends string,
  TableName extends string,
> = References extends readonly [infer First, ...infer Rest]
  ? First extends string
    ? Rest extends readonly string[]
      ? readonly [
          NormalizeReference<First, SchemaKey, TableName>,
          ...NormalizeColumnPath<Rest, SchemaKey, TableName>,
        ]
      : readonly []
    : readonly []
  : readonly [];

export type ColumnName<ColName extends string = string> = `${ColName}`;

export type TableColumnName<
  TableName extends string = string,
  ColName extends string = string,
> = `${TableName}.${ColName}`;

export type SchemaColumnName<
  SchemaName extends string = string,
  TableName extends string = string,
  ColumnName extends string = string,
> = `${SchemaName}.${TableName}.${ColumnName}`;

/**
 * A normalized reference: schema qualified in a named schema, table qualified in
 * the nameless default schema.
 */
export type QualifiedColumnName<
  SchemaName extends string = string,
  TableName extends string = string,
  ColName extends string = string,
> =
  | SchemaColumnName<SchemaName, TableName, ColName>
  | TableColumnName<TableName, ColName>;

export type ColumnPath<
  SchemaName extends string = string,
  TableName extends string = string,
  ColName extends string = string,
> = QualifiedColumnName<SchemaName, TableName, ColName> | ColumnName<ColName>;

export type ColumnReference<
  SchemaName extends string = string,
  TableName extends string = string,
  ColumnName extends string = string,
> = { schemaName: SchemaName; tableName: TableName; columnName: ColumnName };

export type ColumnPathToReference<
  Reference extends ColumnPath = ColumnPath,
  CurrentSchema extends string = string,
  CurrentTable extends string = string,
> =
  NormalizeReference<
    Reference,
    CurrentSchema,
    CurrentTable
  > extends `${infer S}.${infer T}.${infer C}`
    ? { schemaName: S; tableName: T; columnName: C }
    : never;

export type ParseReferencePath<Path extends string> =
  Path extends `${infer Schema}.${infer Table}.${infer Column}`
    ? { schema: Schema; table: Table; column: Column }
    : never;

export type LookupColumnType<AllTypes, Path extends string> =
  ParseReferencePath<Path> extends {
    schema: infer S;
    table: infer T;
    column: infer C;
  }
    ? S extends keyof AllTypes
      ? T extends keyof AllTypes[S]
        ? C extends keyof AllTypes[S][T]
          ? AllTypes[S][T][C] extends { columnTypeName: infer TypeName }
            ? TypeName
            : never
          : never
        : never
      : never
    : never;

export type RelationshipType =
  'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';

export type RelationshipDefinition<
  Columns extends string = string,
  Reference extends string = string,
  RelType extends RelationshipType = RelationshipType,
> = {
  readonly columns: NotEmptyTuple<readonly Columns[]>;
  readonly references: NotEmptyTuple<readonly Reference[]>;
  readonly type: RelType;
};

export type AnyTableRelationshipDefinition = RelationshipDefinition<
  string,
  string,
  RelationshipType
>;

export type AnyTableRelationshipDefinitionWithColumns<
  Columns extends string = string,
> = RelationshipDefinition<Columns, string, RelationshipType>;

export type TableRelationships<Columns extends string = string> = Record<
  string,
  AnyTableRelationshipDefinitionWithColumns<Columns>
>;

export const relationship = <
  const Columns extends readonly string[],
  const References extends readonly string[],
  const RelType extends RelationshipType = RelationshipType,
>(
  columns: Columns,
  references: References,
  type: RelType,
) => {
  return {
    columns,
    references,
    type,
  } as const;
};
export type AnyRelationshipDefinition = RelationshipDefinition;
