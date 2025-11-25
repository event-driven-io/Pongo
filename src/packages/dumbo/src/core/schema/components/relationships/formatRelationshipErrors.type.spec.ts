import { describe, it } from 'node:test';
import type { Equals, Expect } from '../../../testing';
import type {
  Join,
  IndentErrors,
  FormatSingleError,
  FormatRelationshipBlock,
  FormatTableLevel,
  FormatSchemaLevel,
  FormatDatabaseValidationErrors,
  FormatValidationErrors,
} from './formatRelationshipErrors';

void describe('Join', () => {
  void it('concatenates empty array to empty string', () => {
    type Result = Join<[], ', '>;
    type _Then = Expect<Equals<Result, ''>>;
  });

  void it('handles single element', () => {
    type Result = Join<['foo'], ', '>;
    type _Then = Expect<Equals<Result, 'foo'>>;
  });

  void it('concatenates multiple elements with separator', () => {
    type Result = Join<['foo', 'bar', 'baz'], ', '>;
    type _Then = Expect<Equals<Result, 'foo, bar, baz'>>;
  });

  void it('handles different separators', () => {
    type Result = Join<['a', 'b', 'c'], ' | '>;
    type _Then = Expect<Equals<Result, 'a | b | c'>>;
  });
});

void describe('IndentErrors', () => {
  void it('formats empty array', () => {
    type Result = IndentErrors<[]>;
    type _Then = Expect<Equals<Result, []>>;
  });

  void it('adds bullet and indent to single message', () => {
    type Result = IndentErrors<['Missing column']>;
    type _Then = Expect<Equals<Result, ['  - Missing column']>>;
  });

  void it('adds bullet and indent to multiple messages', () => {
    type Result = IndentErrors<['First error', 'Second error', 'Third error']>;
    type Expected = ['  - First error', '  - Second error', '  - Third error'];
    type _Then = Expect<Equals<Result, Expected>>;
  });
});

void describe('FormatSingleError', () => {
  void it('formats reference_columns_mismatch error', () => {
    type Error = {
      errorCode: 'reference_columns_mismatch';
      invalidColumns: ['col1', 'col2'];
      availableColumns: ['id', 'name'];
    };
    type Result = FormatSingleError<Error>;
    type Expected = 'Invalid columns: col1, col2. Available columns: id, name';
    type _Then = Expect<Equals<Result, Expected>>;
  });

  void it('formats reference_length_mismatch error', () => {
    type Error = {
      errorCode: 'reference_length_mismatch';
      columns: ['col1', 'col2'];
      references: ['public.users.id'];
    };
    type Result = FormatSingleError<Error>;
    type Expected =
      'Column count mismatch: 2 columns ([col1, col2]) but 1 references ([public.users.id])';
    type _Then = Expect<Equals<Result, Expected>>;
  });

  void it('formats missing_schema error', () => {
    type Error = {
      errorCode: 'missing_schema';
      reference: 'nonexistent.users.id';
    };
    type Result = FormatSingleError<Error>;
    type Expected =
      'Schema "nonexistent" does not exist (nonexistent.users.id)';
    type _Then = Expect<Equals<Result, Expected>>;
  });

  void it('formats missing_table error', () => {
    type Error = {
      errorCode: 'missing_table';
      reference: 'public.nonexistent.id';
    };
    type Result = FormatSingleError<Error>;
    type Expected =
      'Table "nonexistent" does not exist in schema "public" (public.nonexistent.id)';
    type _Then = Expect<Equals<Result, Expected>>;
  });

  void it('formats missing_column error', () => {
    type Error = {
      errorCode: 'missing_column';
      reference: 'public.users.nonexistent';
    };
    type Result = FormatSingleError<Error>;
    type Expected =
      'Column "nonexistent" does not exist in table "public.users" (public.users.nonexistent)';
    type _Then = Expect<Equals<Result, Expected>>;
  });

  void it('formats type_mismatch error', () => {
    type Error = {
      errorCode: 'type_mismatch';
      reference: 'public.users.id';
      referenceType: 'INTEGER';
      columnTypeName: 'BIGINT';
    };
    type Result = FormatSingleError<Error>;
    type Expected =
      'Type mismatch: column type "BIGINT" does not match referenced column type "INTEGER" (public.users.id)';
    type _Then = Expect<Equals<Result, Expected>>;
  });
});

void describe('FormatRelationshipBlock', () => {
  void it('formats single error in relationship', () => {
    type Input = {
      relationship: 'user';
      errors: [
        {
          errorCode: 'missing_schema';
          reference: 'nonexistent.users.id';
        },
      ];
    };
    type Result = FormatRelationshipBlock<Input>;
    type Expected = `Relationship "user":
  - Schema "nonexistent" does not exist (nonexistent.users.id)`;
    type _Then = Expect<Equals<Result, Expected>>;
  });

  void it('formats multiple errors in relationship', () => {
    type Input = {
      relationship: 'posts';
      errors: [
        {
          errorCode: 'reference_length_mismatch';
          columns: ['col1', 'col2'];
          references: ['public.users.id'];
        },
        {
          errorCode: 'type_mismatch';
          reference: 'public.users.id';
          referenceType: 'INTEGER';
          columnTypeName: 'BIGINT';
        },
      ];
    };
    type Result = FormatRelationshipBlock<Input>;
    type Expected = `Relationship "posts":
  - Column count mismatch: 2 columns ([col1, col2]) but 1 references ([public.users.id])
  - Type mismatch: column type "BIGINT" does not match referenced column type "INTEGER" (public.users.id)`;
    type _Then = Expect<Equals<Result, Expected>>;
  });
});

void describe('FormatTableLevel', () => {
  void it('formats single relationship error in table', () => {
    type Input = {
      table: 'posts';
      errors: [
        {
          relationship: 'user';
          errors: [
            {
              errorCode: 'missing_schema';
              reference: 'nonexistent.users.id';
            },
          ];
        },
      ];
    };
    type Result = FormatTableLevel<Input>;
    type Expected = `Table "posts":
  Relationship "user":
    - Schema "nonexistent" does not exist (nonexistent.users.id)`;
    type _Then = Expect<Equals<Result, Expected>>;
  });

  void it('formats multiple relationship errors in table', () => {
    type Input = {
      table: 'posts';
      errors: [
        {
          relationship: 'user';
          errors: [
            {
              errorCode: 'type_mismatch';
              reference: 'public.users.id';
              referenceType: 'INTEGER';
              columnTypeName: 'BIGINT';
            },
          ];
        },
        {
          relationship: 'category';
          errors: [
            {
              errorCode: 'missing_table';
              reference: 'public.categories.id';
            },
          ];
        },
      ];
    };
    type Result = FormatTableLevel<Input>;
    type Expected = `Table "posts":
  Relationship "user":
    - Type mismatch: column type "BIGINT" does not match referenced column type "INTEGER" (public.users.id)
  Relationship "category":
    - Table "categories" does not exist in schema "public" (public.categories.id)`;
    type _Then = Expect<Equals<Result, Expected>>;
  });
});

void describe('FormatSchemaLevel', () => {
  void it('formats single table error in schema', () => {
    type Input = {
      schema: 'public';
      errors: [
        {
          table: 'posts';
          errors: [
            {
              relationship: 'user';
              errors: [
                {
                  errorCode: 'missing_schema';
                  reference: 'nonexistent.users.id';
                },
              ];
            },
          ];
        },
      ];
    };
    type Result = FormatSchemaLevel<Input>;
    type Expected = `Schema "public":
  Table "posts":
    Relationship "user":
      - Schema "nonexistent" does not exist (nonexistent.users.id)`;
    type _Then = Expect<Equals<Result, Expected>>;
  });

  void it('formats multiple table errors in schema', () => {
    type Input = {
      schema: 'public';
      errors: [
        {
          table: 'posts';
          errors: [
            {
              relationship: 'user';
              errors: [
                {
                  errorCode: 'type_mismatch';
                  reference: 'public.users.id';
                  referenceType: 'INTEGER';
                  columnTypeName: 'BIGINT';
                },
              ];
            },
          ];
        },
        {
          table: 'comments';
          errors: [
            {
              relationship: 'post';
              errors: [
                {
                  errorCode: 'missing_column';
                  reference: 'public.posts.post_id';
                },
              ];
            },
          ];
        },
      ];
    };
    type Result = FormatSchemaLevel<Input>;
    type Expected = `Schema "public":
  Table "posts":
    Relationship "user":
      - Type mismatch: column type "BIGINT" does not match referenced column type "INTEGER" (public.users.id)
  Table "comments":
    Relationship "post":
      - Column "post_id" does not exist in table "public.posts" (public.posts.post_id)`;
    type _Then = Expect<Equals<Result, Expected>>;
  });
});

void describe('FormatDatabaseValidationErrors', () => {
  void it('formats database validation errors with multiple schemas', () => {
    type Input = [
      {
        schema: 'public';
        errors: [
          {
            table: 'posts';
            errors: [
              {
                relationship: 'user';
                errors: [
                  {
                    errorCode: 'type_mismatch';
                    reference: 'public.users.id';
                    referenceType: 'INTEGER';
                    columnTypeName: 'BIGINT';
                  },
                ];
              },
            ];
          },
        ];
      },
      {
        schema: 'auth';
        errors: [
          {
            table: 'sessions';
            errors: [
              {
                relationship: 'user';
                errors: [
                  {
                    errorCode: 'missing_table';
                    reference: 'auth.users.id';
                  },
                ];
              },
            ];
          },
        ];
      },
    ];
    type Result = FormatDatabaseValidationErrors<Input>;
    type Expected = `Schema "public":
  Table "posts":
    Relationship "user":
      - Type mismatch: column type "BIGINT" does not match referenced column type "INTEGER" (public.users.id)
Schema "auth":
  Table "sessions":
    Relationship "user":
      - Table "users" does not exist in schema "auth" (auth.users.id)`;
    type _Then = Expect<Equals<Result, Expected>>;
  });
});

void describe('FormatValidationErrors', () => {
  void it('formats validation result with errors', () => {
    type Input = {
      valid: false;
      error: [
        {
          schema: 'public';
          errors: [
            {
              table: 'posts';
              errors: [
                {
                  relationship: 'user';
                  errors: [
                    {
                      errorCode: 'missing_schema';
                      reference: 'nonexistent.users.id';
                    },
                  ];
                },
              ];
            },
          ];
        },
      ];
    };
    type Result = FormatValidationErrors<Input>;
    type Expected = `Relationship validation errors:

Schema "public":
  Table "posts":
    Relationship "user":
      - Schema "nonexistent" does not exist (nonexistent.users.id)`;
    type _Then = Expect<Equals<Result, Expected>>;
  });

  void it('returns never for valid result', () => {
    type Input = {
      valid: true;
      error: undefined;
    };
    type Result = FormatValidationErrors<Input>;
    type _Then = Expect<Equals<Result, never>>;
  });
});
