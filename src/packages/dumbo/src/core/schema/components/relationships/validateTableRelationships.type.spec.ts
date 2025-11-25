import { describe, it } from 'node:test';
import { SQL } from '../../../sql';
import type { Equals, Expect, IsError } from '../../../testing';
import type { TypeValidationResult } from '../../../typing';
import { dumboSchema } from '../../dumboSchema';
import { relationship } from './relationshipTypes';
import type { ValidateTableRelationships } from './relationshipValidation';

const { schema, table, column } = dumboSchema;
const { Integer, BigInteger } = SQL.column.type;

void describe('ValidateTableRelationships', () => {
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

  const typeMismatchTable = table('type_mismatch', {
    columns: {
      user_id: column('user_id', BigInteger),
    },
    relationships: {
      user: relationship(['user_id'], ['public.users.id'], 'one-to-one'),
    },
  });

  const _publicSchema = schema('public', {
    users: usersTable,
    posts: postsTable,
    type_mismatch: typeMismatchTable,
  });

  type _TestSchemas = {
    public: typeof _publicSchema;
  };

  void it('returns empty array when all relationships are valid', () => {
    type Result = ValidateTableRelationships<
      typeof postsTable,
      typeof _publicSchema,
      _TestSchemas
    >;

    type _Then = Expect<Equals<Result, []>>;
  });

  void it('collects errors when relationship has length mismatch', () => {
    const _invalidTable = table('invalid', {
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

    type Result = ValidateTableRelationships<
      typeof _invalidTable,
      typeof _publicSchema,
      _TestSchemas
    >;

    type Expected = TypeValidationResult<
      false,
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
      }
    >;

    type _Then = [Expect<IsError<Result>>, Expect<Equals<Result, Expected>>];
  });

  void it('collects errors when relationship references missing schema', () => {
    const _missingSchemaTable = table('missing_schema', {
      columns: {
        user_id: column('user_id', Integer),
      },
      relationships: {
        bad_schema_rel: relationship(
          ['user_id'],
          ['nonexistent.users.id'],
          'one-to-one',
        ),
      },
    });

    type Result = ValidateTableRelationships<
      typeof _missingSchemaTable,
      typeof _publicSchema,
      _TestSchemas
    >;

    type Expected = TypeValidationResult<
      false,
      {
        table: 'missing_schema';
        errors: [
          {
            relationship: 'bad_schema_rel';
            errors: [
              {
                errorCode: 'missing_schema';
                reference: 'nonexistent.users.id';
              },
            ];
          },
        ];
      }
    >;

    type _Then = [Expect<IsError<Result>>, Expect<Equals<Result, Expected>>];
  });

  void it('collects errors from multiple invalid relationships', () => {
    const _multiErrorTable = table('multi_error', {
      columns: {
        col1: column('col1', Integer),
        col2: column('col2', Integer),
      },
      relationships: {
        rel1: relationship(['col1', 'col2'], ['public.users.id'], 'one-to-one'),
        rel2: relationship(['col1'], ['nonexistent.table.id'], 'one-to-one'),
      },
    });

    type Result = ValidateTableRelationships<
      typeof _multiErrorTable,
      typeof _publicSchema,
      _TestSchemas
    >;

    type Expected = TypeValidationResult<
      false,
      {
        table: 'multi_error';
        errors: [
          {
            relationship: 'rel1';
            errors: [
              {
                errorCode: 'reference_length_mismatch';
                columns: readonly ['col1', 'col2'];
                references: readonly ['public.users.id'];
              },
            ];
          },
          {
            relationship: 'rel2';
            errors: [
              {
                errorCode: 'missing_schema';
                reference: 'nonexistent.table.id';
              },
            ];
          },
        ];
      }
    >;

    type _Then = [Expect<IsError<Result>>, Expect<Equals<Result, Expected>>];
  });

  void it('returns empty array when table has no relationships', () => {
    const _noRelTable = table('no_rels', {
      columns: {
        id: column('id', Integer),
      },
    });

    type Result = ValidateTableRelationships<
      typeof _noRelTable,
      typeof _publicSchema,
      _TestSchemas
    >;

    type _Then = Expect<Equals<Result, []>>;
  });

  void it('collects errors for type mismatch', () => {
    type Result = ValidateTableRelationships<
      typeof typeMismatchTable,
      typeof _publicSchema,
      _TestSchemas
    >;

    type Expected = {
      valid: false;
      error: {
        table: 'type_mismatch';
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
      };
    };

    type _Then = [Expect<IsError<Result>>, Expect<Equals<Result, Expected>>];
  });
});
