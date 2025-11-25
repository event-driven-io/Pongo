import { describe, it } from 'node:test';
import { SQL } from '../../../sql';
import type { Equals, Expect, IsError } from '../../../testing';
import type { TypeValidationResult } from '../../../typing';
import { dumboSchema } from '../../dumboSchema';
import { relationship } from './relationshipTypes';
import type { ValidateDatabaseSchema } from './relationshipValidation';

const { schema, table, column } = dumboSchema;
const { Integer, BigInteger } = SQL.column.type;

void describe('ValidateDatabaseSchema', () => {
  const usersTable = table('users', {
    columns: {
      id: column('id', Integer),
    },
  });

  const postsTable = table('posts', {
    columns: {
      post_id: column('post_id', Integer),
      user_id: column('user_id', Integer),
    },
    relationships: {
      user: relationship(['user_id'], ['public.users.id'], 'one-to-one'),
    },
  });

  const _validSchema = schema('public', {
    users: usersTable,
    posts: postsTable,
  });

  type ValidSchemas = {
    public: typeof _validSchema;
  };

  void it('returns success when all tables are valid', () => {
    type Result = ValidateDatabaseSchema<typeof _validSchema, ValidSchemas>;

    type _Then = Expect<Equals<Result, TypeValidationResult<true, undefined>>>;
  });

  void it('collects errors from a single invalid table', () => {
    const invalidTable = table('invalid', {
      columns: {
        col1: column('col1', Integer),
        col2: column('col2', Integer),
      },
      relationships: {
        bad_rel: relationship(
          ['col1', 'col2'],
          ['public.users.id'],
          'one-to-one',
        ),
      },
    });

    const _schemaWithInvalidTable = schema('public', {
      users: usersTable,
      invalid: invalidTable,
    });

    type TestSchemas = {
      public: typeof _schemaWithInvalidTable;
    };

    type Result = ValidateDatabaseSchema<
      typeof _schemaWithInvalidTable,
      TestSchemas
    >;

    type Expected = TypeValidationResult<
      false,
      {
        schema: 'public';
        errors: [
          {
            table: 'invalid';
            errors: [
              {
                relationship: 'bad_rel';
                errors: [
                  {
                    errorCode: 'reference_length_mismatch';
                    columns: readonly ['col1', 'col2'];
                    references: readonly ['public.users.id'];
                  },
                ];
              },
            ];
          },
        ];
      }
    >;

    type _Then = [Expect<IsError<Result>>, Expect<Equals<Result, Expected>>];
  });

  void it('collects errors from multiple invalid tables', () => {
    const invalidTable1 = table('invalid1', {
      columns: {
        col1: column('col1', Integer),
      },
      relationships: {
        bad_rel: relationship(['col1'], ['nonexistent.table.id'], 'one-to-one'),
      },
    });

    const invalidTable2 = table('invalid2', {
      columns: {
        col2: column('col2', BigInteger),
      },
      relationships: {
        user: relationship(['col2'], ['public.users.id'], 'one-to-one'),
      },
    });

    const _schemaWithMultipleInvalid = schema('public', {
      users: usersTable,
      invalid1: invalidTable1,
      invalid2: invalidTable2,
    });

    type TestSchemas = {
      public: typeof _schemaWithMultipleInvalid;
    };

    type Result = ValidateDatabaseSchema<
      typeof _schemaWithMultipleInvalid,
      TestSchemas
    >;

    type Expected = TypeValidationResult<
      false,
      {
        schema: 'public';
        errors: [
          {
            table: 'invalid1';
            errors: [
              {
                relationship: 'bad_rel';
                errors: [
                  {
                    errorCode: 'missing_schema';
                    reference: 'nonexistent.table.id';
                  },
                ];
              },
            ];
          },
          {
            table: 'invalid2';
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
      }
    >;

    type _Then = [Expect<IsError<Result>>, Expect<Equals<Result, Expected>>];
  });

  void it('returns success when schema has no tables', () => {
    const _emptySchema = schema('empty', {});

    type EmptySchemas = {
      empty: typeof _emptySchema;
    };

    type Result = ValidateDatabaseSchema<typeof _emptySchema, EmptySchemas>;

    type _Then = Expect<Equals<Result, TypeValidationResult<true, undefined>>>;
  });
});
