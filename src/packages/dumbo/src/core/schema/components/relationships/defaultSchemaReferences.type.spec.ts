import { describe, it } from 'vitest';
import { DefaultDatabaseSchemaName, SQL } from '../../../sql';
import type { Equals, Expect, IsError } from '../../../testing';
import type { TypeValidationResult } from '../../../typing';
import { dumboSchema } from '../../dumboSchema';
import { databaseSchemaComponent } from '../databaseSchemaComponent';
import type { InferTableComponentColumns } from '../tableComponent';
import type { FormatSingleError } from './formatRelationshipErrors';
import type {
  DefaultSchemaKey,
  NormalizeColumnPath,
} from './relationshipTypes';
import { relationship } from './relationshipTypes';
import type {
  ValidateReference,
  ValidateRelationship,
  ValidateTableRelationships,
} from './relationshipValidation';

const { column, table, schema } = dumboSchema;
const { Integer, BigInteger } = SQL.column.type;

describe('DefaultSchemaKey', () => {
  it('is the default schema name token type', () => {
    type _Then = Expect<Equals<DefaultSchemaKey, DefaultDatabaseSchemaName>>;
  });
});

describe('NormalizeColumnPath in the default schema', () => {
  it('qualifies local columns with the table only', () => {
    type Result = NormalizeColumnPath<['id'], DefaultSchemaKey, 'users'>;

    type _Then = Expect<Equals<Result, readonly ['users.id']>>;
  });

  it('keeps table qualified references unqualified by a schema', () => {
    type Result = NormalizeColumnPath<
      ['posts.post_id'],
      DefaultSchemaKey,
      'users'
    >;

    type _Then = Expect<Equals<Result, readonly ['posts.post_id']>>;
  });

  it('keeps schema qualified references untouched', () => {
    type Result = NormalizeColumnPath<
      ['crm.customers.id'],
      DefaultSchemaKey,
      'users'
    >;

    type _Then = Expect<Equals<Result, readonly ['crm.customers.id']>>;
  });

  it('qualifies with the schema name when the schema is named', () => {
    type Result = NormalizeColumnPath<
      ['id', 'posts.post_id'],
      'public',
      'users'
    >;

    type _Then = Expect<
      Equals<Result, readonly ['public.users.id', 'public.posts.post_id']>
    >;
  });
});

describe('default schema references', () => {
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
      user: relationship(['user_id'], ['users.id'], 'one-to-one'),
    },
  });

  const customersTable = table('customers', {
    columns: {
      id: column('id', Integer),
    },
  });

  const _crmSchema = schema('crm', {
    customers: customersTable,
  });

  const _defaultSchema = databaseSchemaComponent({
    schemaName: DefaultDatabaseSchemaName,
    tables: {
      users: usersTable,
      posts: postsTable,
    },
  });

  type TestSchemas = Record<DefaultSchemaKey, typeof _defaultSchema> & {
    crm: typeof _crmSchema;
  };

  type PostsTable = typeof postsTable;
  type PostsColumns = InferTableComponentColumns<PostsTable>;

  describe('ValidateReference', () => {
    it('resolves a table qualified reference within the default schema', () => {
      type Result = ValidateReference<'users.id', 'posts.user_id', TestSchemas>;

      type _Then = Expect<
        Equals<Result, TypeValidationResult<true, undefined>>
      >;
    });

    it('resolves a schema qualified reference to a named schema', () => {
      type Result = ValidateReference<
        'crm.customers.id',
        'posts.user_id',
        TestSchemas
      >;

      type _Then = Expect<
        Equals<Result, TypeValidationResult<true, undefined>>
      >;
    });

    it('reports a missing table without a schema segment', () => {
      type Result = ValidateReference<
        'nonexistent.id',
        'posts.user_id',
        TestSchemas
      >;

      type _Then = [
        Expect<IsError<Result>>,
        Expect<
          Equals<
            Result,
            TypeValidationResult<
              false,
              {
                errorCode: 'missing_table';
                reference: 'nonexistent.id';
              }
            >
          >
        >,
      ];
    });

    it('reports a missing column without a schema segment', () => {
      type Result = ValidateReference<
        'users.nonexistent',
        'posts.user_id',
        TestSchemas
      >;

      type _Then = [
        Expect<IsError<Result>>,
        Expect<
          Equals<
            Result,
            TypeValidationResult<
              false,
              {
                errorCode: 'missing_column';
                reference: 'users.nonexistent';
              }
            >
          >
        >,
      ];
    });
  });

  describe('ValidateRelationship', () => {
    it('validates a relationship pointing at the default schema', () => {
      type ValidRel = {
        columns: ['user_id'];
        references: ['users.id'];
        type: 'one-to-one';
      };

      type Result = ValidateRelationship<
        PostsColumns,
        ValidRel,
        'user',
        'posts',
        PostsTable,
        typeof _defaultSchema,
        TestSchemas
      >;

      type _Then = Expect<
        Equals<Result, TypeValidationResult<true, undefined>>
      >;
    });

    it('validates a relationship pointing at a named schema', () => {
      type CrossSchemaRel = {
        columns: ['user_id'];
        references: ['crm.customers.id'];
        type: 'one-to-one';
      };

      type Result = ValidateRelationship<
        PostsColumns,
        CrossSchemaRel,
        'customer',
        'posts',
        PostsTable,
        typeof _defaultSchema,
        TestSchemas
      >;

      type _Then = Expect<
        Equals<Result, TypeValidationResult<true, undefined>>
      >;
    });

    it('renders error references without a schema segment', () => {
      type MissingColumnRel = {
        columns: ['user_id'];
        references: ['users.nonexistent'];
        type: 'one-to-one';
      };

      type Result = ValidateRelationship<
        PostsColumns,
        MissingColumnRel,
        'user',
        'posts',
        PostsTable,
        typeof _defaultSchema,
        TestSchemas
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
                    errorCode: 'missing_column';
                    reference: 'users.nonexistent';
                  },
                ];
              }
            >
          >
        >,
      ];
    });

    it('renders type mismatch references without a schema segment', () => {
      const _mismatchTable = table('type_mismatch', {
        columns: {
          user_id: column('user_id', BigInteger),
        },
      });

      type MismatchRel = {
        columns: ['user_id'];
        references: ['users.id'];
        type: 'one-to-one';
      };

      type Result = ValidateRelationship<
        InferTableComponentColumns<typeof _mismatchTable>,
        MismatchRel,
        'user',
        'type_mismatch',
        typeof _mismatchTable,
        typeof _defaultSchema,
        TestSchemas
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
                    reference: 'users.id';
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

  describe('ValidateTableRelationships', () => {
    it('returns empty array when all relationships are valid', () => {
      type Result = ValidateTableRelationships<
        PostsTable,
        typeof _defaultSchema,
        TestSchemas
      >;

      type _Then = Expect<Equals<Result, []>>;
    });

    it('collects errors with references that carry no schema segment', () => {
      const _invalidTable = table('invalid', {
        columns: {
          user_id: column('user_id', Integer),
        },
        relationships: {
          user: relationship(['user_id'], ['users.nonexistent'], 'one-to-one'),
        },
      });

      type Result = ValidateTableRelationships<
        typeof _invalidTable,
        typeof _defaultSchema,
        TestSchemas
      >;

      type Expected = TypeValidationResult<
        false,
        {
          table: 'invalid';
          errors: [
            {
              relationship: 'user';
              errors: [
                {
                  errorCode: 'missing_column';
                  reference: 'users.nonexistent';
                },
              ];
            },
          ];
        }
      >;

      type _Then = [Expect<IsError<Result>>, Expect<Equals<Result, Expected>>];
    });
  });
});

describe('FormatSingleError for default schema references', () => {
  it('formats a missing table without a schema name', () => {
    type Result = FormatSingleError<{
      errorCode: 'missing_table';
      reference: 'nonexistent.id';
    }>;

    type Expected =
      'Table "nonexistent" does not exist in the default schema (nonexistent.id)';

    type _Then = Expect<Equals<Result, Expected>>;
  });

  it('formats a missing column with a table only qualifier', () => {
    type Result = FormatSingleError<{
      errorCode: 'missing_column';
      reference: 'users.nonexistent';
    }>;

    type Expected =
      'Column "nonexistent" does not exist in table "users" (users.nonexistent)';

    type _Then = Expect<Equals<Result, Expected>>;
  });
});
