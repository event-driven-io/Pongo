import type {
  AnyDatabaseSchemaSchemaComponent,
  AnyTableSchemaComponent,
  DatabaseSchemaComponent,
  DatabaseSchemas,
  DatabaseSchemaSchemaComponent,
  DatabaseSchemaTables,
  TableColumnNames,
  TableColumns,
  TableSchemaComponent,
  Writable,
} from '..';
import type { ColumnTypeToken } from '../../../sql/tokens/columnTokens';

export type ExtractSchemaNames<DB> =
  DB extends DatabaseSchemaComponent<infer Schemas extends DatabaseSchemas>
    ? keyof Schemas
    : never;

export type ExtractTableNames<Schema extends AnyDatabaseSchemaSchemaComponent> =
  Schema extends DatabaseSchemaSchemaComponent<
    infer Tables extends DatabaseSchemaTables
  >
    ? keyof Tables
    : never;

export type ExtractColumnNames<Table extends AnyTableSchemaComponent> =
  Table extends TableSchemaComponent<infer Columns extends TableColumns>
    ? TableColumnNames<TableSchemaComponent<Columns>>
    : never;

export type ExtractColumnTypeName<T> =
  T extends ColumnTypeToken<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any,
    infer TypeName,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >
    ? Uppercase<TypeName>
    : never;

export type AllColumnTypes<Schemas extends DatabaseSchemas> = {
  [SchemaName in keyof Schemas]: Schemas[SchemaName] extends DatabaseSchemaSchemaComponent<
    infer Tables
  >
    ? Writable<{
        [TableName in keyof Tables]: Tables[TableName] extends TableSchemaComponent<
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
  [SchemaName in keyof Schemas]: Schemas[SchemaName] extends DatabaseSchemaSchemaComponent<
    infer Tables
  >
    ? {
        [TableName in keyof Tables]: Tables[TableName] extends TableSchemaComponent<
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

export type AllColumnTypesInSchema<
  Schema extends AnyDatabaseSchemaSchemaComponent,
> =
  Schema extends DatabaseSchemaSchemaComponent<infer Tables>
    ? {
        [TableName in keyof Tables]: Tables[TableName] extends TableSchemaComponent<
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
  Schema extends AnyDatabaseSchemaSchemaComponent,
  SchemaName extends string,
> =
  Schema extends DatabaseSchemaSchemaComponent<infer Tables>
    ? {
        [TableName in keyof Tables]: Tables[TableName] extends TableSchemaComponent<
          infer Columns
        >
          ? {
              [ColumnName in keyof Columns]: `${SchemaName & string}.${TableName &
                string}.${ColumnName & string}`;
            }[keyof Columns]
          : never;
      }[keyof Tables]
    : never;

export type NormalizeReference<
  Path extends string,
  CurrentSchema extends string,
  CurrentTable extends string,
> = Path extends `${infer Schema}.${infer Table}.${infer Column}`
  ? `${Schema}.${Table}.${Column}`
  : Path extends `${infer Table}.${infer Column}`
    ? `${CurrentSchema}.${Table}.${Column}`
    : Path extends string
      ? `${CurrentSchema}.${CurrentTable}.${Path}`
      : never;

export type NormalizeReferences<
  References extends readonly string[],
  CurrentSchema extends string,
  CurrentTable extends string,
> = References extends readonly [infer First, ...infer Rest]
  ? First extends string
    ? Rest extends readonly string[]
      ? readonly [
          NormalizeReference<First, CurrentSchema, CurrentTable>,
          ...NormalizeReferences<Rest, CurrentSchema, CurrentTable>,
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
  SchemaName extends string,
  TableName extends string,
  ColumnName extends string,
> = `${SchemaName}.${TableName}.${ColumnName}`;

export type ColumnPath<
  SchemaName extends string = string,
  TableName extends string = string,
  ColName extends string = string,
> =
  | SchemaColumnName<SchemaName, TableName, ColName>
  | TableColumnName<TableName, ColName>
  | ColumnName<ColName>;

export type ColumnReference<
  SchemaName extends string = string,
  TableName extends string = string,
  ColumnName extends string = string,
> = { schemaName: SchemaName; tableName: TableName; columnName: ColumnName };

export type ReferenceToRecord<
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
  | 'one-to-one'
  | 'one-to-many'
  | 'many-to-one'
  | 'many-to-many';

export type RelationshipDefinition<
  Columns extends string = string,
  Reference extends string = string,
  RelType extends RelationshipType = RelationshipType,
> = {
  readonly columns: readonly Columns[];
  readonly references: readonly Reference[];
  readonly type: RelType;
};

export type AnyTableRelationshipDefinition = RelationshipDefinition<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any
>;

export type AnyTableRelationshipDefinitionWithColumns<
  Columns extends string = string,
> = RelationshipDefinition<
  Columns,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any
>;

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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyRelationshipDefinition = RelationshipDefinition<any, any, any>;
