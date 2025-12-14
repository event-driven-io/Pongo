import type {
  AnyTypeValidationError,
  TypeValidationError,
} from '../../../typing';

type ExtractSchemaFromReference<Ref extends string> =
  Ref extends `${infer Schema}.${string}.${string}` ? Schema : never;

type ExtractTableFromReference<Ref extends string> =
  Ref extends `${string}.${infer Table}.${string}` ? Table : never;

type ExtractTablePath<
  SchemaName extends string,
  TableName extends string,
> = `${SchemaName}.${TableName}`;

type ExtractRelationshipName<
  SchemaName extends string,
  TableName extends string,
  RelName extends string,
> = `${ExtractTablePath<SchemaName, TableName>}.${RelName}`;

type FormatColumnList<Cols extends readonly string[]> = Cols extends readonly [
  infer First extends string,
  ...infer Rest extends readonly string[],
]
  ? Rest extends readonly []
    ? First
    : `${First}, ${FormatColumnList<Rest>}`
  : '';

export type FormatSingleErrorMessage<
  E,
  SchemaName extends string = string,
  TableName extends string = string,
  RelName extends string = string,
> = E extends {
  errorCode: 'missing_schema';
  reference: infer Ref extends string;
}
  ? `relationship ${ExtractRelationshipName<SchemaName, TableName, RelName>}: schema '${ExtractSchemaFromReference<Ref>}' not found`
  : E extends {
        errorCode: 'missing_table';
        reference: infer Ref extends string;
      }
    ? `relationship ${ExtractRelationshipName<SchemaName, TableName, RelName>}: table '${ExtractSchemaFromReference<Ref>}.${ExtractTableFromReference<Ref>}' not found`
    : E extends {
          errorCode: 'missing_column';
          reference: infer Ref extends string;
        }
      ? `relationship ${ExtractRelationshipName<SchemaName, TableName, RelName>}: column '${Ref}' not found`
      : E extends {
            errorCode: 'type_mismatch';
            reference: infer Ref extends string;
            columnTypeName: infer ColumnType extends string;
            referenceType: infer RefType extends string;
          }
        ? `relationship ${ExtractRelationshipName<SchemaName, TableName, RelName>}: type mismatch ${ColumnType} → ${RefType} at ${Ref}`
        : E extends {
              errorCode: 'reference_length_mismatch';
              columns: infer Cols extends readonly string[];
              references: infer Refs extends readonly string[];
            }
          ? `relationship ${ExtractRelationshipName<SchemaName, TableName, RelName>}: column count mismatch: ${Cols['length']} local [${FormatColumnList<Cols>}], ${Refs['length']} reference [${FormatColumnList<Refs>}]`
          : string;

type FormatErrorArray<
  Errors extends readonly unknown[],
  SchemaName extends string,
  TableName extends string,
  RelName extends string,
> = {
  [K in keyof Errors]: FormatSingleErrorMessage<
    Errors[K],
    SchemaName,
    TableName,
    RelName
  >;
};

type StructureRelationshipErrors<
  RelErrors extends readonly unknown[],
  SchemaName extends string,
  TableName extends string,
> = RelErrors extends readonly {
  relationship: infer _RelName extends string;
  errors: infer _E extends readonly unknown[];
}[]
  ? {
      [R in RelErrors[number] as R extends {
        relationship: infer Name extends string;
      }
        ? Name
        : never]: R extends {
        relationship: infer RelName extends string;
        errors: infer E extends readonly unknown[];
      }
        ? FormatErrorArray<E, SchemaName, TableName, RelName>
        : never;
    }
  : never;

type StructureTableErrors<
  TableErrors extends readonly unknown[],
  SchemaName extends string,
> = TableErrors extends readonly {
  table: infer _TableName extends string;
  errors: infer _E extends readonly unknown[];
}[]
  ? {
      [T in TableErrors[number] as T extends {
        table: infer Name extends string;
      }
        ? Name
        : never]: T extends {
        table: infer TableName extends string;
        errors: infer E extends readonly unknown[];
      }
        ? {
            relationships: StructureRelationshipErrors<
              E,
              SchemaName,
              TableName
            >;
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
          : never]: S extends {
          schema: infer SchemaName extends string;
          errors: infer E extends readonly unknown[];
        }
          ? StructureTableErrors<E, SchemaName>
          : never;
      }
    : never;

export type StructureValidationErrors<E extends AnyTypeValidationError> =
  E extends TypeValidationError<infer Errors extends readonly unknown[]>
    ? TypeValidationError<{
        _error: 'SCHEMA_VALIDATION_FAILED';
      } & StructureSchemaErrors<Errors>>
    : never;
