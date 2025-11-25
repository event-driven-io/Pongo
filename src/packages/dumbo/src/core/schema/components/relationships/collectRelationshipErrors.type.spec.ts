import { describe, it } from 'node:test';
import { SQL } from '../../../sql';
import type { Equals, Expect } from '../../../testing';
import type { TypeValidationResult } from '../../../typing';
import { dumboSchema } from '../../dumboSchema';
import type { InferTableSchemaComponentColumns } from '../tableSchemaComponent';
import { relationship } from './relationshipTypes';
import type { CollectRelationshipErrors } from './relationshipValidation';

const { schema, table, column } = dumboSchema;
const { Integer, BigInteger, Varchar } = SQL.column.type;

void describe('CollectRelationshipErrors', () => {
  const usersTable = table('users', {
    columns: {
      id: column('id', BigInteger),
      tenant_id: column('tenant_id', Integer),
      name: column('name', Varchar('max')),
    },
  });

  const tenantsTable = table('tenants', {
    columns: {
      id: column('id', Integer),
      name: column('name', Varchar('max')),
    },
  });

  const postsTable = table('posts', {
    columns: {
      id: column('id', BigInteger),
      user_id: column('user_id', BigInteger),
      tenant_id: column('tenant_id', Integer),
      title: column('title', Varchar('max')),
    },
    relationships: {
      user: relationship(['user_id'], ['public.users.id'], 'many-to-one'),
      tenant: relationship(['tenant_id'], ['public.tenants.id'], 'many-to-one'),
    },
  });

  const _publicSchema = schema('public', {
    users: usersTable,
    posts: postsTable,
    tenants: tenantsTable,
  });

  type TestSchemas = {
    public: typeof _publicSchema;
  };

  type PostsTable = typeof postsTable;
  type PostsColumns = InferTableSchemaComponentColumns<PostsTable>;

  void it('returns empty array when all relationships are valid', () => {
    type Result = CollectRelationshipErrors<
      PostsColumns,
      PostsTable['relationships'],
      PostsTable,
      typeof _publicSchema,
      TestSchemas
    >;

    type _Then = Expect<Equals<Result, []>>;
  });

  void it('collects errors for invalid references', () => {
    const _postsTableWithBadRef = table('posts', {
      columns: {
        id: column('id', BigInteger),
        user_id: column('user_id', BigInteger),
      },
      relationships: {
        user: relationship(
          ['user_id'],
          ['public.users.nonexistent'],
          'many-to-one',
        ),
      },
    });

    type BadPostsTable = typeof _postsTableWithBadRef;

    type Result = CollectRelationshipErrors<
      InferTableSchemaComponentColumns<BadPostsTable>,
      BadPostsTable['relationships'],
      BadPostsTable,
      typeof _publicSchema,
      TestSchemas
    >;

    type Expected = [
      TypeValidationResult<
        false,
        {
          relationship: 'user';
          errors: [
            {
              errorCode: 'missing_column';
              reference: 'public.users.nonexistent';
            },
          ];
        }
      >,
    ];

    type _Then = Expect<Equals<Result, Expected>>;
  });

  void it('collects errors from multiple invalid relationships', () => {
    const _postsTableMultipleErrors = table('posts', {
      columns: {
        id: column('id', BigInteger),
        user_id: column('user_id', BigInteger),
        tenant_id: column('tenant_id', Integer),
      },
      relationships: {
        user: relationship(
          ['user_id'],
          ['nonexistent.users.id'],
          'many-to-one',
        ),
        tenant: relationship(
          ['tenant_id'],
          ['public.missing.id'],
          'many-to-one',
        ),
      },
    });

    type MultiErrorTable = typeof _postsTableMultipleErrors;

    type Result = CollectRelationshipErrors<
      InferTableSchemaComponentColumns<MultiErrorTable>,
      MultiErrorTable['relationships'],
      MultiErrorTable,
      typeof _publicSchema,
      TestSchemas
    >;

    type Expected = [
      TypeValidationResult<
        false,
        {
          relationship: 'user';
          errors: [
            {
              errorCode: 'missing_schema';
              reference: 'nonexistent.users.id';
            },
          ];
        }
      >,
      TypeValidationResult<
        false,
        {
          relationship: 'tenant';
          errors: [
            {
              errorCode: 'missing_table';
              reference: 'public.missing.id';
            },
          ];
        }
      >,
    ];

    type _Then = Expect<Equals<Result, Expected>>;
  });

  void it('collects type mismatch errors', () => {
    const _postsTableTypeMismatch = table('posts', {
      columns: {
        id: column('id', BigInteger),
        user_id: column('user_id', BigInteger),
      },
      relationships: {
        user: relationship(['user_id'], ['public.users.name'], 'many-to-one'),
      },
    });

    type MismatchTable = typeof _postsTableTypeMismatch;

    type Result = CollectRelationshipErrors<
      InferTableSchemaComponentColumns<MismatchTable>,
      MismatchTable['relationships'],
      MismatchTable,
      typeof _publicSchema,
      TestSchemas
    >;

    type Expected = [
      TypeValidationResult<
        false,
        {
          relationship: 'user';
          errors: [
            {
              errorCode: 'type_mismatch';
              reference: 'public.users.name';
              referenceType: 'VARCHAR';
              columnTypeName: 'BIGINT';
            },
          ];
        }
      >,
    ];

    type _Then = Expect<Equals<Result, Expected>>;
  });

  void it('collects length mismatch errors', () => {
    const _postsTableLengthMismatch = table('posts', {
      columns: {
        id: column('id', BigInteger),
        user_id: column('user_id', BigInteger),
        tenant_id: column('tenant_id', Integer),
      },
      relationships: {
        composite: relationship(
          ['user_id', 'tenant_id'],
          ['public.users.id'],
          'many-to-one',
        ),
      },
    });

    type LengthMismatchTable = typeof _postsTableLengthMismatch;

    type Result = CollectRelationshipErrors<
      InferTableSchemaComponentColumns<LengthMismatchTable>,
      LengthMismatchTable['relationships'],
      LengthMismatchTable,
      typeof _publicSchema,
      TestSchemas
    >;

    type Expected = [
      TypeValidationResult<
        false,
        {
          relationship: 'composite';
          errors: [
            {
              errorCode: 'reference_length_mismatch';
              columns: readonly ['user_id', 'tenant_id'];
              references: readonly ['public.users.id'];
            },
          ];
        }
      >,
    ];

    type _Then = Expect<Equals<Result, Expected>>;
  });

  void it('skips valid relationships and only collects errors', () => {
    const _postsTableMixed = table('posts', {
      columns: {
        id: column('id', BigInteger),
        user_id: column('user_id', BigInteger),
        tenant_id: column('tenant_id', Integer),
      },
      relationships: {
        user: relationship(['user_id'], ['public.users.id'], 'many-to-one'),
        tenant: relationship(
          ['tenant_id'],
          ['public.tenants.bad'],
          'many-to-one',
        ),
      },
    });

    type MixedTable = typeof _postsTableMixed;

    type Result = CollectRelationshipErrors<
      InferTableSchemaComponentColumns<MixedTable>,
      MixedTable['relationships'],
      MixedTable,
      typeof _publicSchema,
      TestSchemas
    >;

    type Expected = [
      TypeValidationResult<
        false,
        {
          relationship: 'tenant';
          errors: [
            {
              errorCode: 'missing_column';
              reference: 'public.tenants.bad';
            },
          ];
        }
      >,
    ];

    type _Then = Expect<Equals<Result, Expected>>;
  });

  void it('handles composite foreign keys', () => {
    const compositeUsersTable = table('users', {
      columns: {
        id: column('id', BigInteger),
        tenant_id: column('tenant_id', Integer),
      },
    });

    const compositePostsTable = table('posts', {
      columns: {
        id: column('id', BigInteger),
        user_id: column('user_id', BigInteger),
        tenant_id: column('tenant_id', Integer),
      },
      relationships: {
        userTenant: relationship(
          ['user_id', 'tenant_id'],
          ['public.users.id', 'public.users.tenant_id'],
          'many-to-one',
        ),
      },
    });

    const _compositeSchema = schema('public', {
      users: compositeUsersTable,
      posts: compositePostsTable,
    });

    type CompositeSchemas = {
      public: typeof _compositeSchema;
    };

    type CompositePostsTable = typeof compositePostsTable;

    type Result = CollectRelationshipErrors<
      InferTableSchemaComponentColumns<CompositePostsTable>,
      CompositePostsTable['relationships'],
      CompositePostsTable,
      typeof _compositeSchema,
      CompositeSchemas
    >;

    type _Then = Expect<Equals<Result, []>>;
  });
});
