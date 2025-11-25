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
    ? keyof Schemas & string
    : never;

export type ExtractTableNames<Schema extends AnyDatabaseSchemaSchemaComponent> =
  Schema extends DatabaseSchemaSchemaComponent<
    infer Tables extends DatabaseSchemaTables
  >
    ? keyof Tables & string
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
    ? Uppercase<TypeName & string>
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

export type NormalizeReferencePath<
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

export type RelationshipDefinition<Columns = string, References = string> = {
  readonly columns: readonly Columns[];
  readonly references: readonly References[];
  readonly type: RelationshipType;
};

export type TableRelationships<Columns extends string = string> = Record<
  string,
  RelationshipDefinition<Columns, string>
>;

export const relationship = <
  const Columns extends readonly string[],
  const References extends readonly string[],
>(
  columns: Columns,
  references: References,
  type: RelationshipType,
) => {
  return {
    columns,
    references,
    type,
  } as const;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyRelationshipDefinition = RelationshipDefinition<any, any>;
