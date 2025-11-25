import { describe, it } from 'node:test';
import { SQL } from '../../../sql';
import type { Equals, Expect, IsError } from '../../../testing';
import type { TypeValidationResult } from '../../../typing';
import { dumboSchema } from '../../dumboSchema';
import type { InferTableSchemaComponentColumns } from '../tableSchemaComponent';
import type { ValidateRelationship } from './relationshipValidation';

const { schema, table, column } = dumboSchema;
const { Integer, BigInteger } = SQL.column.type;

void describe('ValidateRelationship', () => {
  const usersTable = table('users', {
    columns: {
      id: column('id', Integer),
    },
  });

  const postsTable = table('posts', {
    columns: {
      post_id: column('post_id', Integer),
      user_id: column('user_id', Integer),
      tenant_id: column('tenant_id', Integer),
    },
  });

  const typeMismatchTable = table('type_mismatch', {
    columns: {
      user_id: column('user_id', BigInteger),
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

  type PostsTable = typeof postsTable;
  type ExistingColumns = InferTableSchemaComponentColumns<PostsTable>;

  void it('fails when columns and references have different lengths', () => {
    type MismatchedLengthRel = {
      columns: ['user_id', 'tenant_id'];
      references: ['public.users.id'];
      type: 'one-to-one';
    };

    type Result = ValidateRelationship<
      ExistingColumns,
      MismatchedLengthRel,
      'user_author',
      'posts',
      PostsTable,
      typeof _publicSchema,
      _TestSchemas
    >;

    type _Then = [
      Expect<IsError<Result>>,
      Expect<
        Equals<
          Result,
          TypeValidationResult<
            false,
            {
              relationship: 'user_author';
              errors: [
                {
                  errorCode: 'reference_length_mismatch';
                  columns: ['user_id', 'tenant_id'];
                  references: ['public.users.id'];
                },
              ];
            }
          >
        >
      >,
    ];
  });

  void it('fails when columns and references are both empty', () => {
    type EmptyRel = {
      columns: [];
      references: [];
      type: 'one-to-one';
    };

    type Result = ValidateRelationship<
      ExistingColumns,
      EmptyRel,
      'empty_rel',
      'posts',
      PostsTable,
      typeof _publicSchema,
      _TestSchemas
    >;

    type _Then = [
      Expect<IsError<Result>>,
      Expect<
        Equals<
          Result,
          TypeValidationResult<
            false,
            {
              relationship: 'empty_rel';
              errors: [
                {
                  errorCode: 'reference_length_mismatch';
                  columns: [];
                  references: [];
                },
              ];
            }
          >
        >
      >,
    ];
  });

  void it('fails when references are longer than columns', () => {
    type ReferencesLongerRel = {
      columns: ['user_id'];
      references: ['public.users.id', 'public.users.tenant_id'];
      type: 'one-to-one';
    };

    type Result = ValidateRelationship<
      ExistingColumns,
      ReferencesLongerRel,
      'multi_ref',
      'posts',
      PostsTable,
      typeof _publicSchema,
      _TestSchemas
    >;

    type _Then = [
      Expect<IsError<Result>>,
      Expect<
        Equals<
          Result,
          TypeValidationResult<
            false,
            {
              relationship: 'multi_ref';
              errors: [
                {
                  errorCode: 'reference_length_mismatch';
                  columns: ['user_id'];
                  references: ['public.users.id', 'public.users.tenant_id'];
                },
              ];
            }
          >
        >
      >,
    ];
  });

  void it('collects missing schema errors', () => {
    type MissingSchemaRel = {
      columns: ['user_id'];
      references: ['nonexistent.users.id'];
      type: 'one-to-one';
    };

    type Result = ValidateRelationship<
      ExistingColumns,
      MissingSchemaRel,
      'bad_schema_ref',
      'posts',
      PostsTable,
      typeof _publicSchema,
      _TestSchemas
    >;

    type _Then = [
      Expect<IsError<Result>>,
      Expect<
        Equals<
          Result,
          TypeValidationResult<
            false,
            {
              relationship: 'bad_schema_ref';
              errors: [
                {
                  errorCode: 'missing_schema';
                  reference: 'nonexistent.users.id';
                },
              ];
            }
          >
        >
      >,
    ];
  });

  void it('collects missing table errors', () => {
    type MissingTableRel = {
      columns: ['user_id'];
      references: ['public.nonexistent.id'];
      type: 'one-to-one';
    };

    type Result = ValidateRelationship<
      ExistingColumns,
      MissingTableRel,
      'bad_table_ref',
      'posts',
      PostsTable,
      typeof _publicSchema,
      _TestSchemas
    >;

    type _Then = [
      Expect<IsError<Result>>,
      Expect<
        Equals<
          Result,
          TypeValidationResult<
            false,
            {
              relationship: 'bad_table_ref';
              errors: [
                {
                  errorCode: 'missing_table';
                  reference: 'public.nonexistent.id';
                },
              ];
            }
          >
        >
      >,
    ];
  });

  void it('collects missing column errors', () => {
    type MissingColumnRel = {
      columns: ['user_id'];
      references: ['public.users.nonexistent'];
      type: 'one-to-one';
    };

    type Result = ValidateRelationship<
      ExistingColumns,
      MissingColumnRel,
      'bad_column_ref',
      'posts',
      PostsTable,
      typeof _publicSchema,
      _TestSchemas
    >;

    type _Then = [
      Expect<IsError<Result>>,
      Expect<
        Equals<
          Result,
          TypeValidationResult<
            false,
            {
              relationship: 'bad_column_ref';
              errors: [
                {
                  errorCode: 'missing_column';
                  reference: 'public.users.nonexistent';
                },
              ];
            }
          >
        >
      >,
    ];
  });

  void it('collects multiple errors from different references', () => {
    type MultipleErrorsRel = {
      columns: ['user_id', 'tenant_id'];
      references: ['nonexistent.users.id', 'public.missing_table.id'];
      type: 'one-to-one';
    };

    type Result = ValidateRelationship<
      ExistingColumns,
      MultipleErrorsRel,
      'multi_error_rel',
      'posts',
      PostsTable,
      typeof _publicSchema,
      _TestSchemas
    >;

    type _Then = [
      Expect<IsError<Result>>,
      Expect<
        Equals<
          Result,
          TypeValidationResult<
            false,
            {
              relationship: 'multi_error_rel';
              errors: [
                {
                  errorCode: 'missing_schema';
                  reference: 'nonexistent.users.id';
                },
                {
                  errorCode: 'missing_table';
                  reference: 'public.missing_table.id';
                },
              ];
            }
          >
        >
      >,
    ];
  });

  void it('collects all errors when all references are invalid', () => {
    type AllInvalidRel = {
      columns: ['user_id', 'tenant_id', 'post_id'];
      references: [
        'schema1.table1.col1',
        'schema2.table2.col2',
        'schema3.table3.col3',
      ];
      type: 'one-to-one';
    };

    type Result = ValidateRelationship<
      ExistingColumns,
      AllInvalidRel,
      'all_invalid',
      'posts',
      PostsTable,
      typeof _publicSchema,
      _TestSchemas
    >;

    type _Then = [
      Expect<IsError<Result>>,
      Expect<
        Equals<
          Result,
          TypeValidationResult<
            false,
            {
              relationship: 'all_invalid';
              errors: [
                {
                  errorCode: 'missing_schema';
                  reference: 'schema1.table1.col1';
                },
                {
                  errorCode: 'missing_schema';
                  reference: 'schema2.table2.col2';
                },
                {
                  errorCode: 'missing_schema';
                  reference: 'schema3.table3.col3';
                },
              ];
            }
          >
        >
      >,
    ];
  });

  void it('collects type mismatch errors', () => {
    type TypeMismatchTable = typeof typeMismatchTable;
    type TypeMismatchColumns =
      InferTableSchemaComponentColumns<TypeMismatchTable>;

    type TypeMismatchRel = {
      columns: ['user_id'];
      references: ['public.users.id'];
      type: 'one-to-one';
    };

    type Result = ValidateRelationship<
      TypeMismatchColumns,
      TypeMismatchRel,
      'user',
      'type_mismatch',
      TypeMismatchTable,
      typeof _publicSchema,
      _TestSchemas
    >;

    type _Then = [
      Expect<IsError<Result>>,
      Expect<
        Equals<
          Result,
          TypeValidationResult<
            false,
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
            }
          >
        >
      >,
    ];
  });
});
