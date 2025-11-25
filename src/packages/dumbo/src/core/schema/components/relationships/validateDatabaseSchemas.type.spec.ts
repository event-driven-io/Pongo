import { describe, it } from 'node:test';
import { SQL } from '../../../sql';
import type { Equals, Expect, IsError } from '../../../testing';
import type { TypeValidationResult } from '../../../typing';
import { dumboSchema } from '../../dumboSchema';
import { relationship } from './relationshipTypes';
import type { ValidateDatabaseSchemas } from './relationshipValidation';

const { schema, table, column } = dumboSchema;
const { Integer, BigInteger } = SQL.column.type;

void describe('ValidateDatabaseSchemas', () => {
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

  void it('returns success when all schemas are valid', () => {
    const _publicSchema = schema('public', {
      users: usersTable,
      posts: postsTable,
    });

    type ValidSchemas = {
      public: typeof _publicSchema;
    };

    type Result = ValidateDatabaseSchemas<ValidSchemas>;

    type _Then = Expect<Equals<Result, TypeValidationResult<true, undefined>>>;
  });

  void it('collects errors from a single invalid schema', () => {
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

    const _publicSchema = schema('public', {
      users: usersTable,
      invalid: invalidTable,
    });

    type TestSchemas = {
      public: typeof _publicSchema;
    };

    type Result = ValidateDatabaseSchemas<TestSchemas>;

    type Expected = TypeValidationResult<
      false,
      [
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
        },
      ]
    >;

    type _Then = [Expect<IsError<Result>>, Expect<Equals<Result, Expected>>];
  });

  void it('collects errors from multiple invalid schemas', () => {
    const invalidTable1 = table('invalid1', {
      columns: {
        col1: column('col1', Integer),
      },
      relationships: {
        bad_rel: relationship(['col1'], ['nonexistent.table.id'], 'one-to-one'),
      },
    });

    const _schema1 = schema('schema1', {
      invalid1: invalidTable1,
    });

    const invalidTable2 = table('invalid2', {
      columns: {
        col2: column('col2', BigInteger),
      },
      relationships: {
        user: relationship(['col2'], ['schema1.invalid1.col1'], 'one-to-one'),
      },
    });

    const _schema2 = schema('schema2', {
      invalid2: invalidTable2,
    });

    type TestSchemas = {
      schema1: typeof _schema1;
      schema2: typeof _schema2;
    };

    type Result = ValidateDatabaseSchemas<TestSchemas>;

    type Expected = TypeValidationResult<
      false,
      [
        {
          schema: 'schema1';
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
          ];
        },
        {
          schema: 'schema2';
          errors: [
            {
              table: 'invalid2';
              errors: [
                {
                  relationship: 'user';
                  errors: [
                    {
                      errorCode: 'type_mismatch';
                      reference: 'schema1.invalid1.col1';
                      referenceType: 'INTEGER';
                      columnTypeName: 'BIGINT';
                    },
                  ];
                },
              ];
            },
          ];
        },
      ]
    >;

    type _Then = [Expect<IsError<Result>>, Expect<Equals<Result, Expected>>];
  });

  void it('returns success when database has no schemas', () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    type EmptySchemas = {};

    type Result = ValidateDatabaseSchemas<EmptySchemas>;

    type _Then = Expect<Equals<Result, TypeValidationResult<true, undefined>>>;
  });
});
