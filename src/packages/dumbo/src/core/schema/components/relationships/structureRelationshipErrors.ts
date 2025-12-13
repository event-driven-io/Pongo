import type {
  AnyTypeValidationError,
  TypeValidationError,
} from '../../../typing';

type ExtractSchemaFromReference<Ref extends string> =
  Ref extends `${infer Schema}.${string}.${string}` ? Schema : never;

type ExtractTableFromReference<Ref extends string> =
  Ref extends `${string}.${infer Table}.${string}` ? Table : never;

type ExtractColumnFromReference<Ref extends string> =
  Ref extends `${string}.${string}.${infer Column}` ? Column : never;

export type FormatSingleErrorMessage<E> = E extends {
  errorCode: 'missing_schema';
  reference: infer Ref extends string;
}
  ? `Schema "${ExtractSchemaFromReference<Ref>}" does not exist (${Ref})`
  : E extends {
        errorCode: 'missing_table';
        reference: infer Ref extends string;
      }
    ? `Table "${ExtractTableFromReference<Ref>}" does not exist in schema "${ExtractSchemaFromReference<Ref>}" (${Ref})`
    : E extends {
          errorCode: 'missing_column';
          reference: infer Ref extends string;
        }
      ? `Column "${ExtractColumnFromReference<Ref>}" does not exist in table "${ExtractSchemaFromReference<Ref>}.${ExtractTableFromReference<Ref>}" (${Ref})`
      : E extends {
            errorCode: 'type_mismatch';
            reference: infer Ref extends string;
            columnTypeName: infer ColumnType extends string;
            referenceType: infer RefType extends string;
          }
        ? `Type mismatch: column type "${ColumnType}" does not match referenced column type "${RefType}" (${Ref})`
        : E extends {
              errorCode: 'reference_length_mismatch';
              columns: infer Cols extends readonly string[];
              references: infer Refs extends readonly string[];
            }
          ? `Column count mismatch: ${Cols['length']} columns ([${Cols extends readonly [
              infer First,
              ...infer Rest,
            ]
              ? `${First & string}${Rest extends readonly string[]
                  ? Rest extends readonly []
                    ? ''
                    : `, ${Rest[number]}`
                  : ''}`
              : ''}]) but ${Refs['length']} references ([${Refs extends readonly [
              infer First,
              ...infer Rest,
            ]
              ? `${First & string}${Rest extends readonly string[]
                  ? Rest extends readonly []
                    ? ''
                    : `, ${Rest[number]}`
                  : ''}`
              : ''}])`
          : string;

type FormatErrorArray<Errors extends readonly unknown[]> = {
  [K in keyof Errors]: FormatSingleErrorMessage<Errors[K]>;
};

type StructureRelationshipErrors<RelErrors extends readonly unknown[]> =
  RelErrors extends readonly {
    relationship: infer _RelName extends string;
    errors: infer _E extends readonly unknown[];
  }[]
    ? {
        [R in RelErrors[number] as R extends {
          relationship: infer Name extends string;
        }
          ? Name
          : never]: R extends { errors: infer E extends readonly unknown[] }
          ? {
              errors: FormatErrorArray<E>;
            }
          : never;
      }
    : never;

type StructureTableErrors<TableErrors extends readonly unknown[]> =
  TableErrors extends readonly {
    table: infer _TableName extends string;
    errors: infer _E extends readonly unknown[];
  }[]
    ? {
        [T in TableErrors[number] as T extends {
          table: infer Name extends string;
        }
          ? Name
          : never]: T extends { errors: infer E extends readonly unknown[] }
          ? {
              relationships: StructureRelationshipErrors<E>;
            }
          : never;
      }
    : never;

type StructureSchemaErrors<SchemaErrors extends readonly unknown[]> =
  SchemaErrors extends readonly {
    schema: infer _SchemaName extends string;
    errors: infer _E extends readonly unknown[];
  }[]
    ? {
        [S in SchemaErrors[number] as S extends {
          schema: infer Name extends string;
        }
          ? Name
          : never]: S extends { errors: infer E extends readonly unknown[] }
          ? {
              tables: StructureTableErrors<E>;
            }
          : never;
      }
    : never;

export type StructureValidationErrors<E extends AnyTypeValidationError> =
  E extends TypeValidationError<infer Errors extends readonly unknown[]>
    ? TypeValidationError<{
        _error: 'RELATIONSHIP_VALIDATION_FAILED';
        schemas: StructureSchemaErrors<Errors>;
      }>
    : never;
