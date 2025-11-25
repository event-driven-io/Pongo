import type {
  AnyDatabaseSchemaComponent,
  AnyDatabaseSchemaSchemaComponent,
  DatabaseSchemaComponent,
  DatabaseSchemaSchemaComponent,
} from '..';
import type {
  AnyTableSchemaComponent,
  TableSchemaComponent,
} from '../tableSchemaComponent';
import type { TableColumnNames } from '../tableTypesInference';
import type {
  AllColumnReferences,
  AnyRelationshipDefinition,
} from './relationshipTypes';

export type ValidationResult<
  Valid extends boolean,
  Error = never,
> = Valid extends true ? { valid: true } : { valid: false; error: Error };

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

type FindInvalidColumns<
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

type AllInTuple<
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
  FK extends { columns: readonly string[] },
  ValidColumns extends string,
> =
  AllInTuple<FK['columns'], ValidColumns> extends true
    ? ValidationResult<true>
    : ValidationResult<
        false,
        `Invalid foreign key columns: ${FindInvalidColumns<FK['columns'], ValidColumns> extends infer Invalid ? (Invalid extends string[] ? Invalid[number] : never) : never}. Available columns: ${ValidColumns}`
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

export type ValidateRelationshipReferences<
  FK extends { references: readonly string[] },
  ValidReferences extends string,
> =
  AllInTuple<FK['references'], ValidReferences> extends true
    ? ValidationResult<true>
    : ValidationResult<
        false,
        `Invalid foreign key references: ${FindInvalidReferences<FK['references'], ValidReferences> extends infer Invalid ? (Invalid extends string[] ? Invalid[number] : never) : never}. Available references: ${ValidReferences}`
      >;

export type ValidateSingleRelationship<
  FK extends { columns: readonly string[]; references: readonly string[] },
  TableColumns extends string,
  ValidReferences extends string,
> =
  ValidateRelationshipLength<FK> extends { valid: false; error: infer E }
    ? ValidationResult<false, E>
    : ValidateRelationshipColumns<FK, TableColumns> extends {
          valid: false;
          error: infer E;
        }
      ? ValidationResult<false, E>
      : ValidateRelationshipReferences<FK, ValidReferences> extends {
            valid: false;
            error: infer E;
          }
        ? ValidationResult<false, E>
        : ValidationResult<true>;

export type ValidateRelationship<
  FKs extends Record<string, AnyRelationshipDefinition>,
  TableColumns extends string,
  ValidReferences extends string,
> = keyof FKs extends never
  ? ValidationResult<true>
  : ValidateSingleRelationship<
        FKs[keyof FKs],
        TableColumns,
        ValidReferences
      > extends {
        valid: false;
        error: infer E;
      }
    ? ValidationResult<false, E>
    : ValidationResult<true>;

export type ValidateTableRelationships<
  Table extends AnyTableSchemaComponent,
  ValidReferences extends string,
> =
  Table extends TableSchemaComponent<infer _Columns, infer FKs>
    ? ValidateRelationship<
        FKs,
        TableColumnNames<Table> & string,
        ValidReferences
      >
    : ValidationResult<true>;

export type ValidateTablesInSchema<
  Tables extends Record<string, AnyTableSchemaComponent>,
  ValidReferences extends string,
> = {
  [TableName in keyof Tables]: ValidateTableRelationships<
    Tables[TableName],
    ValidReferences
  >;
}[keyof Tables] extends infer Results
  ? Results extends { valid: true }
    ? ValidationResult<true>
    : Results extends { valid: false; error: infer E }
      ? ValidationResult<false, E>
      : ValidationResult<true>
  : ValidationResult<true>;

export type ValidateSchemaRelationships<
  Schema extends AnyDatabaseSchemaSchemaComponent,
  ValidReferences extends string,
> =
  Schema extends DatabaseSchemaSchemaComponent<infer Tables>
    ? ValidateTablesInSchema<Tables, ValidReferences>
    : ValidationResult<true>;

export type ValidateSchemasInDatabase<
  Schemas extends Record<string, AnyDatabaseSchemaSchemaComponent>,
  ValidReferences extends string,
> = {
  [SchemaName in keyof Schemas]: ValidateSchemaRelationships<
    Schemas[SchemaName],
    ValidReferences
  >;
}[keyof Schemas] extends infer Results
  ? Results extends { valid: true }
    ? ValidationResult<true>
    : Results extends { valid: false; error: infer E }
      ? ValidationResult<false, E>
      : ValidationResult<true>
  : ValidationResult<true>;

export type ValidateDatabaseRelationships<
  DB extends AnyDatabaseSchemaComponent,
> =
  DB extends DatabaseSchemaComponent<infer Schemas>
    ? ValidateSchemasInDatabase<Schemas, AllColumnReferences<DB>>
    : ValidationResult<true>;
