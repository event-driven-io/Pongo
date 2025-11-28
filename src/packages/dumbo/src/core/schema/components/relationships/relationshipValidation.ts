import type {
  AnyDatabaseSchemaSchemaComponent,
  DatabaseSchemas,
  DatabaseSchemaSchemaComponent,
  DatabaseSchemaTables,
} from '..';
import type {
  AnyTableSchemaComponent,
  TableColumns,
  TableSchemaComponent,
} from '../tableSchemaComponent';
import type {
  AllColumnReferences,
  AllColumnTypes,
  AnyTableRelationshipDefinition,
  AnyTableRelationshipDefinitionWithColumns,
  ColumnReference,
  ExtractColumnTypeName,
  LookupColumnType,
  NormalizeReference,
  NormalizeReferences,
} from './relationshipTypes';

export type ValidationResult<
  Valid extends boolean,
  Error = never,
> = Valid extends true ? { valid: true } : { valid: false; error: Error };

export type TypeMismatchError = {
  type: 'type_mismatch';
  column: string;
  expectedType: string;
  actualType: string;
  reference: string;
};

export type LengthMismatchError = {
  type: 'length_mismatch';
  columnsLength: number;
  referencesLength: number;
};

export type InvalidColumnError = {
  type: 'invalid_column';
  column: string;
  availableColumns: string;
};

export type InvalidReferenceError = {
  type: 'invalid_reference';
  reference: string;
  availableReferences: string;
};

export type RelationshipValidationError =
  | TypeMismatchError
  | LengthMismatchError
  | InvalidColumnError
  | InvalidReferenceError;

export type FormatTypeMismatchError<E extends TypeMismatchError> =
  `Column ${E['column']} has type ${E['actualType']} but ${E['reference']} has type ${E['expectedType']}`;

export type FormatError<E> = E extends string
  ? E
  : E extends TypeMismatchError
    ? FormatTypeMismatchError<E>
    : never;

export type ExtractValidationErrors<T> = T extends {
  valid: false;
  error: infer E;
}
  ? E
  : never;

export type CompareTypes<LocalType extends string, RefType extends string> =
  Uppercase<LocalType> extends Uppercase<RefType> ? true : false;

export type ValidateColumnTypePair<
  LocalColumn extends { type: unknown; name: string },
  ColumnName extends string,
  Reference extends string,
  AllTypes,
  CurrentSchema extends string,
  CurrentTable extends string,
> =
  NormalizeReference<
    Reference,
    CurrentSchema,
    CurrentTable
  > extends infer NormalizedRef
    ? NormalizedRef extends string
      ? ExtractColumnTypeName<LocalColumn['type']> extends infer LocalType
        ? LookupColumnType<AllTypes, NormalizedRef> extends infer RefType
          ? RefType extends string
            ? LocalType extends string
              ? CompareTypes<LocalType, RefType> extends true
                ? ValidationResult<true>
                : ValidationResult<
                    false,
                    {
                      type: 'type_mismatch';
                      column: ColumnName;
                      expectedType: RefType;
                      actualType: LocalType;
                      reference: NormalizedRef;
                    }
                  >
              : ValidationResult<true>
            : ValidationResult<true>
          : ValidationResult<true>
        : ValidationResult<true>
      : ValidationResult<true>
    : ValidationResult<true>;

type CollectTypePairErrors<
  Columns extends readonly string[],
  References extends readonly string[],
  TableColumns extends Record<string, { type: unknown; name: string }>,
  AllTypes,
  CurrentSchema extends string,
  CurrentTable extends string,
  Errors extends TypeMismatchError[] = [],
> = Columns extends readonly [infer FirstCol, ...infer RestCols]
  ? References extends readonly [infer FirstRef, ...infer RestRefs]
    ? FirstCol extends Extract<keyof TableColumns, string>
      ? FirstRef extends string
        ? RestCols extends readonly string[]
          ? RestRefs extends readonly string[]
            ? ValidateColumnTypePair<
                TableColumns[FirstCol],
                FirstCol,
                FirstRef,
                AllTypes,
                CurrentSchema,
                CurrentTable
              > extends {
                valid: false;
                error: infer E extends TypeMismatchError;
              }
              ? CollectTypePairErrors<
                  RestCols,
                  RestRefs,
                  TableColumns,
                  AllTypes,
                  CurrentSchema,
                  CurrentTable,
                  [...Errors, E]
                >
              : CollectTypePairErrors<
                  RestCols,
                  RestRefs,
                  TableColumns,
                  AllTypes,
                  CurrentSchema,
                  CurrentTable,
                  Errors
                >
            : Errors
          : Errors
        : Errors
      : Errors
    : Errors
  : Errors;

type FormatMultipleTypeMismatchErrors<
  Errors extends readonly TypeMismatchError[],
> = Errors extends readonly [infer First, ...infer Rest]
  ? First extends TypeMismatchError
    ? Rest extends readonly TypeMismatchError[]
      ? Rest['length'] extends 0
        ? FormatTypeMismatchError<First>
        : `${FormatTypeMismatchError<First>}; ${FormatMultipleTypeMismatchErrors<Rest>}`
      : FormatTypeMismatchError<First>
    : never
  : never;

export type ValidateColumnTypePairs<
  Columns extends readonly string[],
  References extends readonly string[],
  TableColumns extends Record<string, { type: unknown; name: string }>,
  AllTypes,
  CurrentSchema extends string,
  CurrentTable extends string,
  _Index extends number = 0,
> =
  CollectTypePairErrors<
    Columns,
    References,
    TableColumns,
    AllTypes,
    CurrentSchema,
    CurrentTable
  > extends infer CollectedErrors
    ? CollectedErrors extends readonly TypeMismatchError[]
      ? CollectedErrors['length'] extends 0
        ? ValidationResult<true>
        : CollectedErrors extends readonly [
              TypeMismatchError,
              ...TypeMismatchError[],
            ]
          ? ValidationResult<
              false,
              FormatMultipleTypeMismatchErrors<CollectedErrors>
            >
          : ValidationResult<true>
      : ValidationResult<true>
    : ValidationResult<true>;

type GetArrayLength<T extends readonly unknown[]> = T['length'];

export type ValidateRelationshipLength<
  FK extends { columns: readonly unknown[]; references: readonly unknown[] },
> =
  GetArrayLength<FK['columns']> extends GetArrayLength<FK['references']>
    ? ValidationResult<true>
    : ValidationResult<
        false,
        `Foreign key columns and references must have the same length. Got ${GetArrayLength<FK['columns']>} columns and ${GetArrayLength<FK['references']>} references.`
      >;

export type FindInvalidColumns<
  Columns extends readonly string[],
  ValidColumns extends string,
  Invalid extends string[] = [],
> = Columns extends readonly [infer First, ...infer Rest]
  ? First extends string
    ? Rest extends readonly string[]
      ? First extends ValidColumns
        ? FindInvalidColumns<Rest, ValidColumns, Invalid>
        : FindInvalidColumns<Rest, ValidColumns, [...Invalid, First]>
      : Invalid
    : Invalid
  : Invalid;

export type AllInTuple<
  Tuple extends readonly string[],
  Union extends string,
> = Tuple extends readonly [infer First, ...infer Rest]
  ? First extends Union
    ? Rest extends readonly string[]
      ? AllInTuple<Rest, Union>
      : true
    : false
  : true;

export type ValidateRelationshipColumns<
  ValidColumns extends TableColumns,
  Relationship extends AnyTableRelationshipDefinition,
> =
  AllInTuple<
    Relationship['columns'],
    Extract<keyof ValidColumns, string>
  > extends true
    ? ValidationResult<true>
    : ValidationResult<
        false,
        `Invalid foreign key columns: ${FindInvalidColumns<Relationship['columns'] & readonly string[], Extract<keyof ValidColumns, string>> extends infer Invalid ? (Invalid extends string[] ? Invalid[number] : never) : never}. Available columns: ${keyof ValidColumns & string}`
      >;

type FindInvalidReferences<
  References extends readonly string[],
  ValidReferences extends string,
  Invalid extends string[] = [],
> = References extends readonly [infer First, ...infer Rest]
  ? First extends string
    ? Rest extends readonly string[]
      ? First extends ValidReferences
        ? FindInvalidReferences<Rest, ValidReferences, Invalid>
        : FindInvalidReferences<Rest, ValidReferences, [...Invalid, First]>
      : Invalid
    : Invalid
  : Invalid;

type FilterSameSchemaReferences<
  References extends readonly string[],
  CurrentSchema extends string,
  Filtered extends string[] = [],
> = References extends readonly [infer First, ...infer Rest]
  ? First extends string
    ? Rest extends readonly string[]
      ? First extends `${CurrentSchema}.${string}.${string}`
        ? FilterSameSchemaReferences<Rest, CurrentSchema, [...Filtered, First]>
        : FilterSameSchemaReferences<Rest, CurrentSchema, Filtered>
      : Filtered
    : Filtered
  : Filtered;

export type ValidateRelationshipReferences<
  FK extends { references: readonly string[] },
  ValidReferences extends string,
  CurrentSchema extends string,
  CurrentTable extends string,
> =
  NormalizeReferences<
    FK['references'],
    CurrentSchema,
    CurrentTable
  > extends infer NormalizedRefs
    ? NormalizedRefs extends readonly string[]
      ? FilterSameSchemaReferences<
          NormalizedRefs,
          CurrentSchema
        > extends infer SameSchemaRefs
        ? SameSchemaRefs extends readonly string[]
          ? SameSchemaRefs['length'] extends 0
            ? ValidationResult<true>
            : AllInTuple<SameSchemaRefs, ValidReferences> extends true
              ? ValidationResult<true>
              : ValidationResult<
                  false,
                  `Invalid foreign key references: ${FindInvalidReferences<SameSchemaRefs, ValidReferences> extends infer Invalid ? (Invalid extends string[] ? Invalid[number] : never) : never}. Available references: ${ValidReferences}`
                >
          : ValidationResult<true>
        : ValidationResult<true>
      : ValidationResult<true>
    : ValidationResult<true>;

export type ValidateReference<
  ColReference extends ColumnReference,
  Schemas extends DatabaseSchemas,
> =
  ColReference extends ColumnReference<
    infer SchemaName,
    infer TableName,
    infer ColumnName
  >
    ? SchemaName extends keyof Schemas
      ? TableName extends keyof Schemas[SchemaName]['tables']
        ? Schemas[SchemaName]['tables'][TableName] extends TableSchemaComponent<
            infer Columns,
            infer _TableName,
            infer _Relationships
          >
          ? Columns[ColumnName]
          : never
        : never
      : never
    : never;

export type ValidateRelationship<
  Columns extends TableColumns,
  Relationship extends AnyTableRelationshipDefinitionWithColumns<
    Extract<keyof Columns, string>
  >,
  CurrentTable extends string,
  Table extends AnyTableSchemaComponent = AnyTableSchemaComponent,
  Schema extends
    AnyDatabaseSchemaSchemaComponent = SchemaTablesWithSingle<Table>,
  Schemas extends DatabaseSchemas = DatabaseSchemasWithSingle<Schema>,
> =
  ValidateRelationshipLength<Relationship> extends {
    valid: false;
    error: infer E;
  }
    ? ValidationResult<false, E>
    : ValidateRelationshipColumns<Columns, Relationship> extends {
          valid: false;
          error: infer E;
        }
      ? ValidationResult<false, E>
      : ValidateRelationshipReferences<
            Relationship,
            AllColumnReferences<Schemas>,
            Schema['schemaName'],
            CurrentTable
          > extends {
            valid: false;
            error: infer E;
          }
        ? ValidationResult<false, E>
        : ValidateColumnTypePairs<
              Relationship['columns'] & readonly string[],
              Relationship['references'],
              Columns,
              AllColumnTypes<Schemas>,
              Schema['schemaName'],
              CurrentTable
            > extends {
              valid: false;
              error: infer E;
            }
          ? ValidationResult<false, E>
          : ValidationResult<true>;

export type ValidateTableRelationships<
  Table extends AnyTableSchemaComponent,
  Schema extends
    AnyDatabaseSchemaSchemaComponent = SchemaTablesWithSingle<Table>,
  Schemas extends DatabaseSchemas = DatabaseSchemasWithSingle<Schema>,
> =
  Table extends TableSchemaComponent<
    infer Columns,
    infer TableName,
    infer Relationships
  >
    ? keyof Relationships extends Extract<keyof Relationships, string>
      ? ValidateRelationshipLength<Relationships[keyof Relationships]> extends {
          valid: false;
          error: infer E;
        }
        ? ValidationResult<false, E>
        : ValidateRelationshipColumns<
              Columns,
              Relationships[keyof Relationships]
            > extends {
              valid: false;
              error: infer E;
            }
          ? ValidationResult<false, E>
          : ValidateRelationshipReferences<
                Relationships[keyof Relationships],
                AllColumnReferences<Schemas>,
                Schema['schemaName'],
                TableName
              > extends {
                valid: false;
                error: infer E;
              }
            ? ValidationResult<false, E>
            : ValidateColumnTypePairs<
                  Relationships[keyof Relationships]['columns'],
                  Relationships[keyof Relationships]['references'],
                  Columns,
                  AllColumnTypes<Schemas>,
                  Schema['schemaName'],
                  TableName
                > extends {
                  valid: false;
                  error: infer E;
                }
              ? ValidationResult<false, E>
              : ValidationResult<true>
      : ValidationResult<true>
    : ValidationResult<true>;

export type SchemaTablesWithSingle<Table extends AnyTableSchemaComponent> =
  Table extends TableSchemaComponent<
    infer _Columns,
    infer TableName,
    infer _FKs
  >
    ? DatabaseSchemaSchemaComponent<{
        [K in TableName]: Table;
      }>
    : never;

export type DatabaseSchemasWithSingle<
  Schema extends AnyDatabaseSchemaSchemaComponent,
> =
  Schema extends DatabaseSchemaSchemaComponent<infer _Tables, infer _SchemaName>
    ? {
        [K in _SchemaName]: Schema;
      }
    : never;

export type ValidateTable<
  Table extends AnyTableSchemaComponent,
  Schema extends
    AnyDatabaseSchemaSchemaComponent = SchemaTablesWithSingle<Table>,
  Schemas extends DatabaseSchemas = DatabaseSchemasWithSingle<Schema>,
> = ValidateTableRelationships<Table, Schema, Schemas>;

export type ValidateSchemaTables<
  Tables extends Record<string, AnyTableSchemaComponent>,
  Schema extends AnyDatabaseSchemaSchemaComponent,
  Schemas extends DatabaseSchemas = DatabaseSchemasWithSingle<Schema>,
> = {
  [TableName in keyof Tables]: ValidateTable<
    Tables[TableName],
    Schema,
    Schemas
  >;
}[keyof Tables] extends infer Results
  ? ExtractValidationErrors<Results> extends never
    ? ValidationResult<true>
    : ValidationResult<false, ExtractValidationErrors<Results>>
  : ValidationResult<true>;

export type ValidateDatabaseSchema<
  Schema extends AnyDatabaseSchemaSchemaComponent,
  Schemas extends DatabaseSchemas = DatabaseSchemasWithSingle<Schema>,
> =
  Schema extends DatabaseSchemaSchemaComponent<infer Tables>
    ? ValidateSchemaTables<Tables, Schema, Schemas>
    : ValidationResult<true>;

export type ValidateDatabaseSchemas<Schemas extends DatabaseSchemas> = {
  [SchemaName in keyof Schemas]: ValidateDatabaseSchema<
    Schemas[SchemaName],
    Schemas
  >;
}[keyof Schemas] extends infer Results
  ? ExtractValidationErrors<Results> extends never
    ? ValidationResult<true>
    : ValidationResult<false, ExtractValidationErrors<Results>>
  : ValidationResult<true>;

// TODO: Use in DatabaseSchema schema component validation
export type ValidatedSchemaComponent<
  Tables extends DatabaseSchemaTables,
  SchemaName extends string,
> =
  ValidateDatabaseSchema<
    DatabaseSchemaSchemaComponent<Tables, SchemaName>,
    { schemaName: DatabaseSchemaSchemaComponent<Tables, SchemaName> }
  > extends {
    valid: true;
  }
    ? DatabaseSchemaSchemaComponent<Tables>
    : ValidateDatabaseSchema<
          DatabaseSchemaSchemaComponent<Tables, SchemaName>,
          { schemaName: DatabaseSchemaSchemaComponent<Tables, SchemaName> }
        > extends {
          valid: false;
          error: infer E;
        }
      ? { valid: false; error: FormatError<E> }
      : DatabaseSchemaSchemaComponent<Tables>;
