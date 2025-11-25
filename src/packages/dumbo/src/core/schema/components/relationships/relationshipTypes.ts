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
} from '..';

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

export type AllColumnReferences<DB> =
  DB extends DatabaseSchemaComponent<infer Schemas extends DatabaseSchemas>
    ? {
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
      }[keyof Schemas]
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
