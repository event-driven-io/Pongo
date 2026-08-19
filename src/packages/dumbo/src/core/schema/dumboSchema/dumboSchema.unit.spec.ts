import assert from 'node:assert';
import { describe, it } from 'vitest';
import { DefaultDatabaseSchemaName, SQL } from '../../sql';
import type { Equals, Expect } from '../../testing';
import type { TableColumnNames, TableRowType } from '../components';
import { relationship } from '../components';
import { dumboSchema } from './index';

const { database, schema, table, column, index } = dumboSchema;
const { Varchar, JSONB } = SQL.column.type;

describe('dumboSchema', () => {
  it('should create a column', () => {
    const col = column('id', Varchar('max'));
    assert.strictEqual(col.columnName, 'id');
  });

  it('should create an index', () => {
    const idx = index('idx_email', ['email']);
    assert.strictEqual(idx.indexName, 'idx_email');
    assert.strictEqual(idx.isUnique, false);
  });

  it('should create a unique index', () => {
    const idx = index('idx_email', ['email'], { unique: true });
    assert.strictEqual(idx.indexName, 'idx_email');
    assert.strictEqual(idx.isUnique, true);
  });

  it('creates a table with typed column and index records', () => {
    const emailIndex = index('idx_email', ['email']);
    const tbl = table('users', {
      columns: {
        id: column('id', Varchar('max')),
        email: column('email', Varchar('max')),
      },
      indexes: {
        idx_email: emailIndex,
      },
    });

    assert.strictEqual(tbl.tableName, 'users');
    assert.deepStrictEqual(Object.keys(tbl.columns), ['id', 'email']);
    assert.deepStrictEqual(Object.keys(tbl.indexes), ['idx_email']);
    assert.ok(tbl.columns.id);
    assert.ok(tbl.columns.email);
    const boundEmailIndex = tbl.indexes.idx_email;
    assert.strictEqual(boundEmailIndex?.indexName, emailIndex.indexName);
    assert.deepStrictEqual(
      tbl.migrations().map(({ name }) => name),
      ['table:users:create', 'index:users:idx_email:create'],
    );
    assert.ok(tbl.columns.id !== undefined);
    assert.ok(tbl.columns.email !== undefined);
  });

  it('should create a named schema', () => {
    const sch = schema('public', {
      users: table('users', {
        columns: {
          id: column('id', Varchar('max')),
        },
      }),
    });

    assert.strictEqual(sch.schemaName, 'public');
    assert.deepStrictEqual(Object.keys(sch.tables), ['users']);
    assert.ok(sch.tables.users.columns.id !== undefined);
  });

  it('should create a database declaring tables directly', () => {
    const db = database({
      tables: {
        users: table('users', {
          columns: {
            id: column('id', Varchar('max')),
          },
        }),
      },
    });

    assert.strictEqual(db.databaseName, undefined);
    assert.deepStrictEqual(Object.keys(db.tables), ['users']);
    assert.deepStrictEqual(Object.keys(db.schemas), [
      DefaultDatabaseSchemaName,
    ]);
    assert.ok(db.tables.users.columns.id !== undefined);
    assert.deepStrictEqual(
      db.migrations().map(({ name }) => name),
      ['table:users:create'],
    );
  });

  it('should name a database declaring tables directly', () => {
    const db = database('myapp', {
      tables: {
        users: table('users', {
          columns: {
            id: column('id', Varchar('max')),
          },
        }),
      },
    });

    assert.strictEqual(db.databaseName, 'myapp');
    assert.deepStrictEqual(Object.keys(db.tables), ['users']);
  });

  it('should create a default database', () => {
    const db = database({
      schemas: {
        public: schema('public', {
          users: table('users', {
            columns: {
              id: column('id', Varchar('max')),
            },
          }),
        }),
      },
    });

    assert.strictEqual(db.databaseName, undefined);
    assert.deepStrictEqual(Object.keys(db.schemas), [
      DefaultDatabaseSchemaName,
      'public',
    ]);
    assert.deepStrictEqual(Object.keys(db.tables), []);
  });

  it('should create a named database', () => {
    const db = database('myapp', {
      schemas: {
        public: schema('public', {
          users: table('users', {
            columns: {
              id: column('id', Varchar('max')),
            },
          }),
        }),
      },
    });

    assert.strictEqual(db.databaseName, 'myapp');
    assert.deepStrictEqual(Object.keys(db.schemas), [
      DefaultDatabaseSchemaName,
      'public',
    ]);
    assert.ok(db.schemas.public !== undefined);
    assert.ok(db.schemas.public.tables.users !== undefined);
    assert.ok(db.schemas.public.tables.users.columns.id !== undefined);
  });

  it('should add a schema to a database declaring tables', () => {
    const db = database('myapp', {
      tables: {
        users: table('users', {
          columns: {
            id: column('id', Varchar('max')),
          },
        }),
      },
    }).withSchema({
      crm: schema('crm', {
        customers: table('customers', {
          columns: {
            id: column('id', Varchar('max')),
          },
        }),
      }),
    });

    assert.deepStrictEqual(Object.keys(db.tables), ['users']);
    assert.deepStrictEqual(Object.keys(db.schemas), [
      DefaultDatabaseSchemaName,
      'crm',
    ]);
    assert.ok(db.tables.users.columns.id !== undefined);
    assert.ok(db.schemas.crm.tables.customers.columns.id !== undefined);
  });

  it('should create a database declaring neither tables nor schemas', () => {
    const db = database('myapp', {});

    assert.strictEqual(db.databaseName, 'myapp');
    assert.deepStrictEqual(Object.keys(db.tables), []);
    assert.deepStrictEqual(Object.keys(db.schemas), [
      DefaultDatabaseSchemaName,
    ]);
    assert.deepStrictEqual(db.migrations(), []);
  });

  it('should render the SQL name of a schema stored under another record key', () => {
    const declared = database('myapp', {
      schemas: {
        public: schema('audit', {
          users: table('users', {
            columns: {
              id: column('id', Varchar('max')),
            },
          }),
        }),
      },
    });

    assert.deepStrictEqual(
      declared.migrations().map(({ name }) => name),
      ['schema:audit:create', 'table:audit:users:create'],
    );
  });

  it('should preserve the reusable schema declaration', () => {
    const reusable = schema('public', {
      users: table('users', {
        columns: {
          id: column('id', Varchar('max')),
        },
      }),
    });

    const db = database('myapp', { schemas: { public: reusable } });

    assert.strictEqual(db.schemas.public, reusable);
    assert.deepStrictEqual(
      reusable.migrations().map(({ name }) => name),
      ['schema:public:create', 'table:public:users:create'],
    );
  });

  it('should create database from schema names', () => {
    const db = database.from('myapp', ['public', 'analytics']);
    assert.strictEqual(db.databaseName, 'myapp');
    assert.deepStrictEqual(Object.keys(db.schemas), [
      DefaultDatabaseSchemaName,
      'public',
      'analytics',
    ]);
  });
});

// Samples

// Simple database with tables in default schema

const users = table('users', {
  columns: {
    id: column('id', Varchar('max'), { primaryKey: true, notNull: true }),
    email: column('email', Varchar('max'), { notNull: true }),
    name: column('name', Varchar('max')),
  },
  relationships: {
    profile: relationship(['id'], ['public.profiles.user_id'], 'one-to-one'),
  },
});

const _users2 = table('users', {
  columns: {
    id: column('id', Varchar('max'), { primaryKey: true, notNull: true }),
    email: column('email', Varchar('max'), { notNull: true }),
    name: column('name', Varchar('max')),
  },
  relationships: {
    profile: {
      columns: ['id'],
      references: ['public.profiles.user_id'],
      type: 'one-to-one',
    },
  },
});

export const simpleDb = database('myapp', {
  schemas: {
    public: schema('public', {
      users,
    }),
  },
});

// Database with multiple schemas
const multiSchemaDb = database('myapp', {
  schemas: {
    public: schema('public', {
      users: table('users', {
        columns: {
          id: column('id', Varchar('max'), { notNull: true }),
          email: column('email', Varchar('max'), { notNull: true }),
          name: column('name', Varchar('max')),
          metadata: column('metadata', JSONB<{ preferences: string[] }>()),
        },
        primaryKey: ['id'],
      }),
    }),
    analytics: schema('analytics', {
      events: table('events', {
        columns: {
          id: column('id', Varchar('max'), { notNull: true, primaryKey: true }),
          userId: column('user_id', Varchar('max')),
          timestamp: column('timestamp', Varchar('max')),
        },
        relationships: {
          user: {
            columns: ['userId'],
            references: ['public.users.id'],
            type: 'many-to-one',
          },
        },
      }),
    }),
  },
});

// Access using name-based maps
const publicSchema = multiSchemaDb.schemas.public;
const _usersTable = publicSchema.tables.users;

type Users = TableRowType<typeof _usersTable>;

type _IdColumnIsNonNullableString = Expect<Equals<Users['id'], string>>;
type _EmailColumnIsNonNullableString = Expect<Equals<Users['email'], string>>;
type _NameColumnIsNullableString = Expect<Equals<Users['name'], string | null>>;
type _MetadataColumnIsNullableObject = Expect<
  Equals<Users['metadata'], { preferences: string[] } | null>
>;

type UserColumns = TableColumnNames<typeof _usersTable>;

const _userColumns: UserColumns[] = ['id', 'email', 'name', 'metadata'];

describe('Foreign Key Validation', () => {
  it('should accept valid single foreign key', () => {
    const db = database('test', {
      schemas: {
        public: schema('public', {
          users: table('users', {
            columns: {
              id: column('id', Varchar('max')),
              email: column('email', Varchar('max')),
            },
          }),
          posts: table('posts', {
            columns: {
              id: column('id', Varchar('max')),
              user_id: column('user_id', Varchar('max')),
            },
            relationships: {
              user: {
                columns: ['user_id'],
                references: ['public.users.id'],
                type: 'many-to-one',
              },
            },
          }),
        }),
      },
    });

    assert.ok(db.schemas.public.tables.posts.relationships);
    assert.deepStrictEqual(
      db.schemas.public.tables.posts.relationships.user.columns,
      ['user_id'],
    );
  });

  it('should accept valid composite foreign key', () => {
    const db = database('test', {
      schemas: {
        public: schema('public', {
          users: table('users', {
            columns: {
              id: column('id', Varchar('max')),
              tenant_id: column('tenant_id', Varchar('max')),
            },
          }),
          posts: table('posts', {
            columns: {
              id: column('id', Varchar('max')),
              user_id: column('user_id', Varchar('max')),
              tenant_id: column('tenant_id', Varchar('max')),
            },
            relationships: {
              user: {
                columns: ['user_id', 'tenant_id'],
                references: ['public.users.id', 'public.users.tenant_id'],
                type: 'many-to-one',
              },
            },
          }),
        }),
      },
    });

    assert.deepStrictEqual(
      db.schemas.public.tables.posts.relationships.user.columns,
      ['user_id', 'tenant_id'],
    );
  });

  it('should accept self-referential foreign key', () => {
    const db = database('test', {
      schemas: {
        public: schema('public', {
          users: table('users', {
            columns: {
              id: column('id', Varchar('max')),
              manager_id: column('manager_id', Varchar('max')),
            },
            relationships: {
              manager: {
                columns: ['manager_id'],
                references: ['public.users.id'],
                type: 'many-to-one',
              },
            } as const,
          }),
        }),
      },
    });

    assert.ok(db.schemas.public.tables.users.relationships);
    assert.deepStrictEqual(
      db.schemas.public.tables.users.relationships.manager.references,
      ['public.users.id'],
    );
  });

  it('should accept multiple foreign keys in one table', () => {
    const db = database('test', {
      schemas: {
        public: schema('public', {
          users: table('users', {
            columns: {
              id: column('id', Varchar('max')),
            },
          }),
          posts: table('posts', {
            columns: {
              id: column('id', Varchar('max')),
              user_id: column('user_id', Varchar('max')),
              author_id: column('author_id', Varchar('max')),
            },
            relationships: {
              user: {
                columns: ['user_id'],
                references: ['public.users.id'],
                type: 'many-to-one',
              },
              author: {
                columns: ['author_id'],
                references: ['public.users.id'],
                type: 'many-to-one',
              },
            } as const,
          }),
        }),
      },
    });

    assert.strictEqual(
      Object.keys(db.schemas.public.tables.posts.relationships).length,
      2,
    );
  });

  it('should accept cross-schema foreign key', () => {
    const db = database('test', {
      schemas: {
        public: schema('public', {
          users: table('users', {
            columns: {
              id: column('id', Varchar('max')),
            },
          }),
        }),
        analytics: schema('analytics', {
          events: table('events', {
            columns: {
              id: column('id', Varchar('max')),
              user_id: column('user_id', Varchar('max')),
            },
            relationships: {
              user: {
                columns: ['user_id'],
                references: ['public.users.id'],
                type: 'many-to-one',
              },
            },
          }),
        }),
      },
    });

    assert.deepStrictEqual(
      db.schemas.analytics.tables.events.relationships.user.references,
      ['public.users.id'],
    );
  });
});
