import type {
  AnyColumnSchemaComponent,
  AnyDatabaseSchemaComponent,
  ColumnSchemaComponent,
  DatabaseSchemas,
  DatabaseSchemaComponent,
  DatabaseSchemaTables,
} from '..';
import type { FormatValidationErrors } from './formatRelationshipErrors';
import type { AnyColumnTypeToken, ColumnTypeToken } from '../../../sql';
import type {
  ALL,
  AND,
  AnyTypeValidationError,
  AnyTypeValidationFailed,
  FailOnFirstTypeValidationError,
  FilterNotExistingInUnion,
  HaveTuplesTheSameLength,
  IF,
  IsEmptyTuple,
  IsNotEmptyTuple,
  KeysOfString,
  MapRecordCollectErrors,
  NotEmptyTuple,
  TypeValidationError,
  TypeValidationResult,
  TypeValidationSuccess,
  UnwrapTypeValidationErrors,
  ZipTuplesCollectErrors,
} from '../../../typing';
import type {
  AnyTableComponent,
  InferTableComponentData,
  TableColumns,
  TableComponent,
} from '../tableComponent';
import type {
  AnyTableRelationshipDefinition,
  AnyTableRelationshipDefinitionWithColumns,
  NormalizeColumnPath,
  SchemaColumnName,
  TableRelationships,
} from './relationshipTypes';

export type RelationshipColumnsMismatchError<
  ColumnPath extends SchemaColumnName = SchemaColumnName,
> = {
  valid: false;
  error: {
    errorCode: 'reference_columns_mismatch';
    invalidColumns: ColumnPath[];
    availableColumns: ColumnPath[];
  };
};

export type RelationshipReferencesLengthMismatchError<
  ColumnPath extends SchemaColumnName = SchemaColumnName,
> = {
  valid: false;
  error: {
    errorCode: 'reference_length_mismatch';
    columns: ColumnPath[];
    references: ColumnPath[];
  };
};

export type ColumnReferenceExistanceError<
  ErrorCode extends 'missing_schema' | 'missing_table' | 'missing_column' =
    'missing_schema' | 'missing_table' | 'missing_column',
  ColumnPath extends SchemaColumnName = SchemaColumnName,
> = {
  valid: false;
  error: {
    errorCode: ErrorCode;
    reference: ColumnPath;
  };
};

export type ColumnReferenceTypeMismatchError<
  Reference extends SchemaColumnName = SchemaColumnName,
  ReferenceTypeName extends string = string,
  ColumnTypeName extends string = string,
> = {
  valid: false;
  error: {
    errorCode: 'type_mismatch';
    reference: Reference;
    referenceType: ReferenceTypeName;
    columnTypeName: ColumnTypeName;
  };
};

export type NoError = TypeValidationSuccess;

export type ColumnReferenceError =
  ColumnReferenceExistanceError | ColumnReferenceTypeMismatchError;

export type RelationshipValidationError =
  | RelationshipColumnsMismatchError
  | RelationshipReferencesLengthMismatchError
  | ColumnReferenceError;

export type ValidateRelationshipLength<
  Rel extends AnyTableRelationshipDefinition,
> = IF<
  ALL<
    [
      HaveTuplesTheSameLength<Rel['columns'], Rel['references']>,
      IsNotEmptyTuple<Rel['columns']>,
      IsNotEmptyTuple<Rel['references']>,
    ]
  >,
  TypeValidationSuccess,
  TypeValidationResult<
    false,
    {
      errorCode: 'reference_length_mismatch';
      columns: Rel['columns'];
      references: Rel['references'];
    }
  >
>;

export type ValidateRelationshipColumns<
  Relationship extends AnyTableRelationshipDefinition,
  ValidColumns extends TableColumns,
> =
  FilterNotExistingInUnion<
    Relationship['columns'],
    KeysOfString<ValidColumns>
  > extends infer InvalidColumns extends NotEmptyTuple<string[]>
    ? IF<
        AND<
          IsEmptyTuple<InvalidColumns>,
          IsNotEmptyTuple<Relationship['columns']>
        >,
        TypeValidationSuccess,
        TypeValidationResult<
          false,
          {
            errorCode: 'reference_columns_mismatch';
            invalidColumns: InvalidColumns;
            availableColumns: KeysOfString<ValidColumns>;
          }
        >
      >
    : TypeValidationSuccess;

export type ValidateColumnReference<
  ColReference extends SchemaColumnName,
  Schemas extends DatabaseSchemas,
> =
  ColReference extends SchemaColumnName<
    infer SchemaName,
    infer TableName,
    infer ColumnName
  >
    ? SchemaName extends keyof Schemas
      ? TableName extends keyof Schemas[SchemaName]['tables']
        ? Schemas[SchemaName]['tables'][TableName] extends infer Table
          ? Table extends AnyTableComponent
            ? InferTableComponentData<Table> extends {
                columns: infer Columns extends TableColumns;
              }
              ? ColumnName extends keyof Columns
                ? Columns[ColumnName]
                : ColumnReferenceExistanceError<
                    'missing_column',
                    `${SchemaName}.${TableName}.${ColumnName}`
                  >
              : never
            : never
          : never
        : ColumnReferenceExistanceError<
            'missing_table',
            `${SchemaName}.${TableName}.${ColumnName}`
          >
      : ColumnReferenceExistanceError<
          'missing_schema',
          `${SchemaName}.${TableName}.${ColumnName}`
        >
    : never;

export type ValidateColumnTypeMatch<
  RefColumnType extends AnyColumnTypeToken | string =
    AnyColumnTypeToken | string,
  ColumnType extends AnyColumnTypeToken | string = AnyColumnTypeToken | string,
  Reference extends SchemaColumnName = SchemaColumnName,
> =
  ColumnType extends ColumnTypeToken<
    infer _JsType,
    infer ColumnTypeName,
    infer _TProps
  >
    ? RefColumnType extends ColumnTypeToken<
        infer _JsType,
        infer RefColumnTypeName,
        infer _TProps
      >
      ? RefColumnTypeName extends ColumnTypeName
        ? TypeValidationSuccess
        : ColumnReferenceTypeMismatchError<
            Reference,
            RefColumnTypeName,
            ColumnTypeName
          >
      : RefColumnType extends ColumnTypeName
        ? TypeValidationSuccess
        : ColumnReferenceTypeMismatchError<
            Reference,
            Extract<RefColumnType, string>,
            ColumnTypeName
          >
    : RefColumnType extends ColumnTypeToken<
          infer _JsType,
          infer RefColumnTypeName,
          infer _TProps
        >
      ? RefColumnTypeName extends ColumnType
        ? TypeValidationSuccess
        : ColumnReferenceTypeMismatchError<
            Reference,
            RefColumnTypeName,
            Extract<ColumnType, string>
          >
      : RefColumnType extends ColumnType
        ? TypeValidationSuccess
        : ColumnReferenceTypeMismatchError<
            Reference,
            Extract<RefColumnType, string>,
            Extract<ColumnType, string>
          >;

export type ValidateColumnsMatch<
  ReferenceColumn extends AnyColumnSchemaComponent,
  Column extends AnyColumnSchemaComponent,
  references extends SchemaColumnName = SchemaColumnName,
> =
  Column extends ColumnSchemaComponent<infer ColumnType>
    ? ReferenceColumn extends ColumnSchemaComponent<infer RefColumnType>
      ? ValidateColumnTypeMatch<RefColumnType, ColumnType, references>
      : never
    : never;

type SchemaColumn<
  Schemas extends DatabaseSchemas,
  SchemaName extends string,
  TableName extends string,
  ColumnName extends string,
> = SchemaName extends keyof Schemas
  ? Schemas[SchemaName] extends DatabaseSchemaComponent<
      infer Tables extends DatabaseSchemaTables
    >
    ? TableName extends keyof Tables
      ? InferTableComponentData<Tables[TableName]> extends {
          columns: infer Columns extends TableColumns;
        }
        ? ColumnName extends keyof Columns
          ? Columns[ColumnName]
          : never
        : never
      : never
    : never
  : never;

export type ValidateReference<
  RefPath extends SchemaColumnName = SchemaColumnName,
  ColPath extends SchemaColumnName = SchemaColumnName,
  Schemas extends DatabaseSchemas = DatabaseSchemas,
  LocalColumns extends TableColumns | undefined = undefined,
> =
  ColPath extends SchemaColumnName<
    infer SchemaName,
    infer TableName,
    infer Column
  >
    ? ValidateColumnReference<RefPath, Schemas> extends infer RefColumn
      ? RefColumn extends AnyColumnSchemaComponent
        ? LocalColumns extends TableColumns
          ? Column extends keyof LocalColumns
            ? ValidateColumnsMatch<RefColumn, LocalColumns[Column], RefPath>
            : TypeValidationSuccess
          : SchemaColumn<
                Schemas,
                SchemaName,
                TableName,
                Column
              > extends infer LocalColumn extends AnyColumnSchemaComponent
            ? ValidateColumnsMatch<RefColumn, LocalColumn, RefPath>
            : TypeValidationSuccess
        : RefColumn extends {
              valid: false;
              error: infer E;
            }
          ? TypeValidationError<E>
          : never
      : never
    : never;

export type ValidateReferences<
  RefPath extends SchemaColumnName = SchemaColumnName,
  ColPath extends SchemaColumnName = SchemaColumnName,
  Schemas extends DatabaseSchemas = DatabaseSchemas,
  LocalColumns extends TableColumns | undefined = undefined,
> =
  ColPath extends SchemaColumnName<
    infer SchemaName,
    infer TableName,
    infer Column
  >
    ? ValidateColumnReference<RefPath, Schemas> extends infer RefColumn
      ? RefColumn extends AnyColumnSchemaComponent
        ? LocalColumns extends TableColumns
          ? Column extends keyof LocalColumns
            ? ValidateColumnsMatch<RefColumn, LocalColumns[Column], RefPath>
            : TypeValidationSuccess
          : SchemaColumn<
                Schemas,
                SchemaName,
                TableName,
                Column
              > extends infer LocalColumn extends AnyColumnSchemaComponent
            ? ValidateColumnsMatch<RefColumn, LocalColumn, RefPath>
            : TypeValidationSuccess
        : RefColumn extends {
              valid: false;
              error: infer E;
            }
          ? TypeValidationError<E>
          : never
      : never
    : never;

export type CollectReferencesErrors<
  Columns extends readonly SchemaColumnName[],
  References extends readonly SchemaColumnName[],
  _CurrentSchema extends string,
  _CurrentTable extends string,
  Schemas extends DatabaseSchemas = DatabaseSchemas,
  Errors extends AnyTypeValidationError[] = [],
  LocalColumns extends TableColumns | undefined = undefined,
> = ZipTuplesCollectErrors<
  References,
  Columns,
  {
    [R in References[number]]: {
      [C in Columns[number]]: ValidateReference<R, C, Schemas, LocalColumns>;
    };
  },
  Errors
>;

export type SchemaTablesWithSingle<Table extends AnyTableComponent> =
  Table extends TableComponent<infer _Columns, infer TableName>
    ? DatabaseSchemaComponent<
        {
          [K in TableName]: Table;
        },
        string
      >
    : never;

export type DatabaseSchemasWithSingle<
  Schema extends AnyDatabaseSchemaComponent,
> =
  Schema extends DatabaseSchemaComponent<infer _Tables, infer _SchemaName>
    ? {
        [K in Extract<_SchemaName, string>]: Schema;
      }
    : never;

export type ValidateRelationship<
  Columns extends TableColumns,
  Relationship extends AnyTableRelationshipDefinitionWithColumns<
    Extract<keyof Columns, string>
  >,
  RelationshipName extends string,
  CurrentTableName extends string,
  Table extends AnyTableComponent = AnyTableComponent,
  Schema extends AnyDatabaseSchemaComponent = SchemaTablesWithSingle<Table>,
  Schemas extends DatabaseSchemas = DatabaseSchemasWithSingle<Schema>,
> =
  FailOnFirstTypeValidationError<
    [
      ValidateRelationshipLength<Relationship>,
      ValidateRelationshipColumns<Relationship, Columns>,
      CollectReferencesErrors<
        NormalizeColumnPath<
          Relationship['columns'],
          Extract<Schema['schemaName'], string>,
          CurrentTableName
        >,
        NormalizeColumnPath<
          Relationship['references'],
          Extract<Schema['schemaName'], string>,
          CurrentTableName
        >,
        Extract<Schema['schemaName'], string>,
        CurrentTableName,
        Schemas,
        [],
        Columns
      > extends infer Results extends readonly AnyTypeValidationError[]
        ? IF<
            AnyTypeValidationFailed<Results>,
            TypeValidationError<UnwrapTypeValidationErrors<Results>>,
            TypeValidationSuccess
          >
        : TypeValidationSuccess,
    ]
  > extends infer Error extends AnyTypeValidationError
    ? TypeValidationError<{
        relationship: RelationshipName;
        errors: Error extends TypeValidationError<infer E>
          ? E extends readonly unknown[]
            ? E
            : [E]
          : never;
      }>
    : TypeValidationSuccess;

export type CollectRelationshipErrors<
  Columns extends TableColumns = TableColumns,
  Relationships extends TableRelationships<keyof Columns & string> =
    {} & TableRelationships<keyof Columns & string>,
  Table extends AnyTableComponent = AnyTableComponent,
  Schema extends AnyDatabaseSchemaComponent = SchemaTablesWithSingle<Table>,
  Schemas extends DatabaseSchemas = DatabaseSchemasWithSingle<Schema>,
  Errors extends AnyTypeValidationError[] = [],
> = MapRecordCollectErrors<
  Relationships,
  {
    [R in keyof Relationships]: ValidateRelationship<
      Columns,
      Relationships[R] extends AnyTableRelationshipDefinitionWithColumns<
        Extract<keyof Columns, string>
      >
        ? Relationships[R]
        : never,
      Extract<R, string>,
      Table extends TableComponent<infer _Columns, infer TableName>
        ? TableName
        : string,
      Table,
      Schema,
      Schemas
    >;
  },
  Errors
>;

export type ValidateTableRelationships<
  Table extends AnyTableComponent,
  Schema extends AnyDatabaseSchemaComponent = SchemaTablesWithSingle<Table>,
  Schemas extends DatabaseSchemas = DatabaseSchemasWithSingle<Schema>,
> =
  InferTableComponentData<Table> extends {
    columns: infer Columns extends TableColumns;
    tableName: infer TableName extends string;
    relationships: infer Relationships extends TableRelationships<string>;
  }
    ? keyof Relationships extends Extract<keyof Relationships, string>
      ? CollectRelationshipErrors<
          Columns,
          Relationships,
          Table,
          Schema,
          Schemas
        > extends infer Results
        ? AnyTypeValidationFailed<Results> extends true
          ? TypeValidationError<{
              table: TableName;
              errors: UnwrapTypeValidationErrors<
                Results extends readonly AnyTypeValidationError[]
                  ? Results
                  : never
              >;
            }>
          : Results
        : TypeValidationSuccess
      : TypeValidationSuccess
    : TypeValidationSuccess;

export type ValidateTable<
  Table extends AnyTableComponent,
  Schema extends AnyDatabaseSchemaComponent = SchemaTablesWithSingle<Table>,
  Schemas extends DatabaseSchemas = DatabaseSchemasWithSingle<Schema>,
> = ValidateTableRelationships<Table, Schema, Schemas>;

export type ValidateSchemaTables<
  Tables extends Record<string, AnyTableComponent>,
  SchemaName extends string,
  Schema extends AnyDatabaseSchemaComponent,
  Schemas extends DatabaseSchemas = DatabaseSchemasWithSingle<Schema>,
> =
  MapRecordCollectErrors<
    Tables,
    {
      [TableName in keyof Tables]: ValidateTable<
        Tables[TableName],
        Schema,
        Schemas
      >;
    }
  > extends infer Results
    ? AnyTypeValidationFailed<Results> extends true
      ? TypeValidationError<{
          schema: SchemaName;
          errors: UnwrapTypeValidationErrors<
            Results extends readonly AnyTypeValidationError[] ? Results : never
          >;
        }>
      : TypeValidationSuccess
    : TypeValidationSuccess;

export type ValidateDatabaseSchema<
  Schema extends AnyDatabaseSchemaComponent,
  Schemas extends DatabaseSchemas = DatabaseSchemasWithSingle<Schema>,
> =
  Schema extends DatabaseSchemaComponent<infer Tables, infer SchemaName>
    ? ValidateSchemaTables<Tables, Extract<SchemaName, string>, Schema, Schemas>
    : TypeValidationSuccess;

export type ValidateDatabaseSchemas<Schemas extends DatabaseSchemas> =
  MapRecordCollectErrors<
    Schemas,
    {
      [SchemaName in keyof Schemas]: ValidateDatabaseSchema<
        Schemas[SchemaName],
        Schemas
      >;
    }
  > extends infer Results
    ? AnyTypeValidationFailed<Results> extends true
      ? TypeValidationError<
          UnwrapTypeValidationErrors<
            Results extends readonly AnyTypeValidationError[] ? Results : never
          >
        >
      : TypeValidationSuccess
    : TypeValidationSuccess;

export type ValidateDatabaseSchemasWithMessages<
  Schemas extends DatabaseSchemas,
> = FormatValidationErrors<ValidateDatabaseSchemas<Schemas>>;

// TODO: Use in DatabaseSchema schema component validation
// export type ValidatedSchemaComponent<
//   Tables extends DatabaseSchemaTables,
//   SchemaName extends string,
// > =
//   ValidateDatabaseSchema<
//     DatabaseSchemaComponent<Tables, SchemaName>,
//     { schemaName: DatabaseSchemaComponent<Tables, SchemaName> }
//   > extends {
//     valid: true;
//   }
//     ? DatabaseSchemaComponent<Tables>
//     : ValidateDatabaseSchema<
//           DatabaseSchemaComponent<Tables, SchemaName>,
//           { schemaName: DatabaseSchemaComponent<Tables, SchemaName> }
//         > extends {
//           valid: false;
//           error: infer E;
//         }
//       ? { valid: false; error: FormatError<E> }
//       : DatabaseSchemaComponent<Tables>;
