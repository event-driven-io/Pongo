export type Join<
  T extends readonly string[],
  Sep extends string,
> = T extends readonly [
  infer First extends string,
  ...infer Rest extends readonly string[],
]
  ? Rest extends readonly []
    ? First
    : `${First}${Sep}${Join<Rest, Sep>}`
  : '';

export type IndentErrors<Messages extends readonly string[]> =
  Messages extends readonly [
    infer First extends string,
    ...infer Rest extends readonly string[],
  ]
    ? [`  - ${First}`, ...IndentErrors<Rest>]
    : [];

type ExtractSchemaFromReference<T extends string> =
  T extends `${infer Schema}.${string}.${string}` ? Schema : never;

type ExtractTableFromReference<T extends string> =
  T extends `${string}.${infer Table}.${string}` ? Table : never;

type ExtractColumnFromReference<T extends string> =
  T extends `${string}.${string}.${infer Column}` ? Column : never;

type TupleLength<T extends readonly unknown[]> = T extends { length: infer L }
  ? L
  : never;

export type FormatSingleError<E> = E extends {
  errorCode: 'reference_columns_mismatch';
  invalidColumns: infer InvalidCols extends readonly string[];
  availableColumns: infer AvailableCols extends readonly string[];
}
  ? `Invalid columns: ${Join<InvalidCols, ', '>}. Available columns: ${Join<AvailableCols, ', '>}`
  : E extends {
        errorCode: 'reference_length_mismatch';
        columns: infer Cols extends readonly string[];
        references: infer Refs extends readonly string[];
      }
    ? `Column count mismatch: ${TupleLength<Cols>} columns ([${Join<Cols, ', '>}]) but ${TupleLength<Refs>} references ([${Join<Refs, ', '>}])`
    : E extends {
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
                referenceType: infer RefType extends string;
                columnTypeName: infer ColType extends string;
              }
            ? `Type mismatch: column type "${ColType}" does not match referenced column type "${RefType}" (${Ref})`
            : never;

type FormatErrorMessages<Errors extends readonly unknown[]> =
  Errors extends readonly [
    infer First,
    ...infer Rest extends readonly unknown[],
  ]
    ? [FormatSingleError<First>, ...FormatErrorMessages<Rest>]
    : [];

export type FormatRelationshipBlock<E> = E extends {
  relationship: infer RelName extends string;
  errors: infer Errors extends readonly unknown[];
}
  ? Join<
      [
        `Relationship "${RelName}":`,
        ...IndentErrors<FormatErrorMessages<Errors>>,
      ],
      '\n'
    >
  : never;

type IndentLine<Line extends string> = `  ${Line}`;

type IndentRelationshipBlock<Block extends string> =
  Block extends `${infer FirstLine}\n${infer Rest}`
    ? `${IndentLine<FirstLine>}\n${IndentRelationshipBlock<Rest>}`
    : IndentLine<Block>;

type FormatRelationshipBlocks<RelErrors extends readonly unknown[]> =
  RelErrors extends readonly [
    infer First,
    ...infer Rest extends readonly unknown[],
  ]
    ? Rest extends readonly []
      ? IndentRelationshipBlock<FormatRelationshipBlock<First>>
      : `${IndentRelationshipBlock<FormatRelationshipBlock<First>>}\n${FormatRelationshipBlocks<Rest>}`
    : '';

export type FormatTableLevel<E> = E extends {
  table: infer TableName extends string;
  errors: infer RelErrors extends readonly unknown[];
}
  ? `Table "${TableName}":\n${FormatRelationshipBlocks<RelErrors>}`
  : never;

type IndentTableBlock<Block extends string> =
  Block extends `${infer FirstLine}\n${infer Rest}`
    ? `  ${FirstLine}\n${IndentTableBlock<Rest>}`
    : `  ${Block}`;

type FormatTableBlocks<TableErrors extends readonly unknown[]> =
  TableErrors extends readonly [
    infer First,
    ...infer Rest extends readonly unknown[],
  ]
    ? Rest extends readonly []
      ? IndentTableBlock<FormatTableLevel<First>>
      : `${IndentTableBlock<FormatTableLevel<First>>}\n${FormatTableBlocks<Rest>}`
    : '';

export type FormatSchemaLevel<E> = E extends {
  schema: infer SchemaName extends string;
  errors: infer TableErrors extends readonly unknown[];
}
  ? `Schema "${SchemaName}":\n${FormatTableBlocks<TableErrors>}`
  : never;

type FormatSchemaBlocks<SchemaErrors extends readonly unknown[]> =
  SchemaErrors extends readonly [
    infer First,
    ...infer Rest extends readonly unknown[],
  ]
    ? Rest extends readonly []
      ? FormatSchemaLevel<First>
      : `${FormatSchemaLevel<First>}\n${FormatSchemaBlocks<Rest>}`
    : '';

export type FormatDatabaseValidationErrors<Errors extends readonly unknown[]> =
  FormatSchemaBlocks<Errors>;

export type FormatValidationErrors<Result> = Result extends {
  valid: false;
  error: infer Errors extends readonly unknown[];
}
  ? `Relationship validation errors:\n\n${FormatDatabaseValidationErrors<Errors>}`
  : never;
