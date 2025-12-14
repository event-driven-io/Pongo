import { describe, it } from 'node:test';
import { SQL } from '../../../sql';
import type { Equals, Expect } from '../../../testing';
import type { TypeValidationError } from '../../../typing';
import { dumboSchema } from '../../dumboSchema';
import { relationship } from './relationshipTypes';
import type { ValidateDatabaseSchemasWithMessages } from './relationshipValidation';

const { schema, table, column } = dumboSchema;
const { Integer, BigInteger, Varchar } = SQL.column.type;

void describe('ValidateDatabaseSchemasWithMessages', () => {
  const usersTable = table('users', {
    columns: {
      id: column('id', Integer),
      name: column('name', Varchar('max')),
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

  void it('returns schemas unchanged when validation succeeds', () => {
    const _publicSchema = schema('public', {
      users: usersTable,
      posts: postsTable,
    });

    type ValidSchemas = {
      public: typeof _publicSchema;
    };

    type Result = ValidateDatabaseSchemasWithMessages<ValidSchemas>;

    type _Then = Expect<Equals<Result, ValidSchemas>>;
  });

  void it('returns formatted error message for reference_length_mismatch', () => {
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

    type Result = ValidateDatabaseSchemasWithMessages<TestSchemas>;

    type Expected = TypeValidationError<{
      public: {
        invalid: {
          relationships: {
            bad_rel: [
              'relationship public.invalid.bad_rel: column count mismatch: 2 local [col1, col2], 1 reference [public.users.id]',
            ];
          };
        };
      };
    }>;

    type _Then = Expect<Equals<Result, Expected>>;
  });

  void it('returns formatted error message for missing_schema', () => {
    const invalidTable = table('posts', {
      columns: {
        user_id: column('user_id', Integer),
      },
      relationships: {
        user: relationship(['user_id'], ['nonexistent.users.id'], 'one-to-one'),
      },
    });

    const _publicSchema = schema('public', {
      posts: invalidTable,
    });

    type TestSchemas = {
      public: typeof _publicSchema;
    };

    type Result = ValidateDatabaseSchemasWithMessages<TestSchemas>;

    type Expected = TypeValidationError<{
      public: {
        posts: {
          relationships: {
            user: [
              "relationship public.posts.user: schema 'nonexistent' not found",
            ];
          };
        };
      };
    }>;

    type _Then = Expect<Equals<Result, Expected>>;
  });

  void it('returns formatted error message for missing_table', () => {
    const invalidTable = table('posts', {
      columns: {
        user_id: column('user_id', Integer),
      },
      relationships: {
        user: relationship(
          ['user_id'],
          ['public.nonexistent.id'],
          'one-to-one',
        ),
      },
    });

    const _publicSchema = schema('public', {
      posts: invalidTable,
    });

    type TestSchemas = {
      public: typeof _publicSchema;
    };

    type Result = ValidateDatabaseSchemasWithMessages<TestSchemas>;

    type Expected = TypeValidationError<{
      public: {
        posts: {
          relationships: {
            user: [
              "relationship public.posts.user: table 'public.nonexistent' not found",
            ];
          };
        };
      };
    }>;

    type _Then = Expect<Equals<Result, Expected>>;
  });

  void it('returns formatted error message for missing_column', () => {
    const invalidTable = table('posts', {
      columns: {
        user_id: column('user_id', Integer),
      },
      relationships: {
        user: relationship(
          ['user_id'],
          ['public.users.nonexistent'],
          'one-to-one',
        ),
      },
    });

    const _publicSchema = schema('public', {
      users: usersTable,
      posts: invalidTable,
    });

    type TestSchemas = {
      public: typeof _publicSchema;
    };

    type Result = ValidateDatabaseSchemasWithMessages<TestSchemas>;

    type Expected = TypeValidationError<{
      public: {
        posts: {
          relationships: {
            user: [
              "relationship public.posts.user: column 'public.users.nonexistent' not found",
            ];
          };
        };
      };
    }>;

    type _Then = Expect<Equals<Result, Expected>>;
  });

  void it('returns formatted error message for type_mismatch', () => {
    const usersWithBigInt = table('users', {
      columns: {
        id: column('id', BigInteger),
      },
    });

    const postsWithInt = table('posts', {
      columns: {
        user_id: column('user_id', Integer),
      },
      relationships: {
        user: relationship(['user_id'], ['public.users.id'], 'one-to-one'),
      },
    });

    const _publicSchema = schema('public', {
      users: usersWithBigInt,
      posts: postsWithInt,
    });

    type TestSchemas = {
      public: typeof _publicSchema;
    };

    type Result = ValidateDatabaseSchemasWithMessages<TestSchemas>;

    type Expected = TypeValidationError<{
      public: {
        posts: {
          relationships: {
            user: [
              'relationship public.posts.user: type mismatch INTEGER → BIGINT at public.users.id',
            ];
          };
        };
      };
    }>;

    type _Then = Expect<Equals<Result, Expected>>;
  });

  void it('returns formatted error message with multiple errors in one relationship', () => {
    const invalidTable = table('posts', {
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
      posts: invalidTable,
    });

    type TestSchemas = {
      public: typeof _publicSchema;
    };

    type Result = ValidateDatabaseSchemasWithMessages<TestSchemas>;

    type Expected = TypeValidationError<{
      public: {
        posts: {
          relationships: {
            bad_rel: [
              'relationship public.posts.bad_rel: column count mismatch: 2 local [col1, col2], 1 reference [public.users.id]',
            ];
          };
        };
      };
    }>;

    type _Then = Expect<Equals<Result, Expected>>;
  });

  void it('returns formatted error message with multiple relationships in one table', () => {
    const invalidTable = table('posts', {
      columns: {
        user_id: column('user_id', Integer),
        author_id: column('author_id', BigInteger),
      },
      relationships: {
        user: relationship(['user_id'], ['nonexistent.users.id'], 'one-to-one'),
        author: relationship(['author_id'], ['public.users.id'], 'one-to-one'),
      },
    });

    const _publicSchema = schema('public', {
      users: usersTable,
      posts: invalidTable,
    });

    type TestSchemas = {
      public: typeof _publicSchema;
    };

    type Result = ValidateDatabaseSchemasWithMessages<TestSchemas>;

    type Expected = TypeValidationError<{
      public: {
        posts: {
          relationships: {
            user: [
              "relationship public.posts.user: schema 'nonexistent' not found",
            ];
            author: [
              'relationship public.posts.author: type mismatch BIGINT → INTEGER at public.users.id',
            ];
          };
        };
      };
    }>;

    type _Then = Expect<Equals<Result, Expected>>;
  });

  void it('returns formatted error message with multiple tables in one schema', () => {
    const invalidPosts = table('posts', {
      columns: {
        user_id: column('user_id', Integer),
      },
      relationships: {
        user: relationship(
          ['user_id'],
          ['public.nonexistent.id'],
          'one-to-one',
        ),
      },
    });

    const invalidComments = table('comments', {
      columns: {
        post_id: column('post_id', Integer),
      },
      relationships: {
        post: relationship(
          ['post_id'],
          ['public.posts.nonexistent'],
          'one-to-one',
        ),
      },
    });

    const _publicSchema = schema('public', {
      posts: invalidPosts,
      comments: invalidComments,
    });

    type TestSchemas = {
      public: typeof _publicSchema;
    };

    type Result = ValidateDatabaseSchemasWithMessages<TestSchemas>;

    type Expected = TypeValidationError<{
      public: {
        posts: {
          relationships: {
            user: [
              "relationship public.posts.user: table 'public.nonexistent' not found",
            ];
          };
        };
        comments: {
          relationships: {
            post: [
              "relationship public.comments.post: column 'public.posts.nonexistent' not found",
            ];
          };
        };
      };
    }>;

    type _Then = Expect<Equals<Result, Expected>>;
  });

  void it('returns formatted error message with multiple schemas', () => {
    const invalidPosts = table('posts', {
      columns: {
        user_id: column('user_id', BigInteger),
      },
      relationships: {
        user: relationship(['user_id'], ['public.users.id'], 'one-to-one'),
      },
    });

    const invalidSessions = table('sessions', {
      columns: {
        user_id: column('user_id', Integer),
      },
      relationships: {
        user: relationship(['user_id'], ['auth.users.id'], 'one-to-one'),
      },
    });

    const _publicSchema = schema('public', {
      users: usersTable,
      posts: invalidPosts,
    });

    const _authSchema = schema('auth', {
      sessions: invalidSessions,
    });

    type TestSchemas = {
      public: typeof _publicSchema;
      auth: typeof _authSchema;
    };

    type Result = ValidateDatabaseSchemasWithMessages<TestSchemas>;

    type Expected = TypeValidationError<{
      public: {
        posts: {
          relationships: {
            user: [
              'relationship public.posts.user: type mismatch BIGINT → INTEGER at public.users.id',
            ];
          };
        };
      };
      auth: {
        sessions: {
          relationships: {
            user: [
              "relationship auth.sessions.user: table 'auth.users' not found",
            ];
          };
        };
      };
    }>;

    type _Then = Expect<Equals<Result, Expected>>;
  });

  void it('returns schemas unchanged for empty schemas object', () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    type EmptySchemas = {};

    type Result = ValidateDatabaseSchemasWithMessages<EmptySchemas>;

    type _Then = Expect<Equals<Result, EmptySchemas>>;
  });
});
