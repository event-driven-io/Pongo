import assert from 'node:assert';
import { describe, it } from 'node:test';
import { SQL } from '../../sql';
import type { Equal, Expect } from '../../testing';
import type { TableColumnNames, TableRowType } from '../components';
import { foreignKey } from '../components';
import { dumboSchema } from './index';

const { database, schema, table, column, index } = dumboSchema;
const { Varchar, JSONB } = SQL.column.type;

void describe('dumboSchema', () => {
  void it('should create a column', () => {
    const col = column('id', Varchar('max'));
    assert.strictEqual(col.columnName, 'id');
  });

  void it('should create an index', () => {
    const idx = index('idx_email', ['email']);
    assert.strictEqual(idx.indexName, 'idx_email');
    assert.strictEqual(idx.isUnique, false);
  });

  void it('should create a unique index', () => {
    const idx = index('idx_email', ['email'], { unique: true });
    assert.strictEqual(idx.indexName, 'idx_email');
    assert.strictEqual(idx.isUnique, true);
  });

  void it('should create a table with columns and indexes', () => {
    const tbl = table('users', {
      columns: {
        id: column('id', Varchar('max')),
        email: column('email', Varchar('max')),
      },
      indexes: {
        idx_email: index('idx_email', ['email']),
      },
    });

    assert.strictEqual(tbl.tableName, 'users');
    assert.strictEqual(tbl.columns.size, 2);
    assert.strictEqual(tbl.indexes.size, 1);
    assert.ok(tbl.columns.has('id'));
    assert.ok(tbl.columns.has('email'));
    assert.ok(tbl.indexes.has('idx_email'));
    assert.ok(tbl.columns.id !== undefined);
    assert.ok(tbl.columns.email !== undefined);
  });

  void it('should create a named schema', () => {
    const sch = schema('public', {
      users: table('users', {
        columns: {
          id: column('id', Varchar('max')),
        },
      }),
    });

    assert.strictEqual(sch.schemaName, 'public');
    assert.strictEqual(sch.tables.size, 1);
    assert.ok(sch.tables.has('users'));
    assert.ok(sch.tables.users.columns.id !== undefined);
  });

  void it('should create a default schema without name', () => {
    const sch = schema({
      users: table('users', {
        columns: {
          id: column('id', Varchar('max')),
        },
      }),
    });

    assert.strictEqual(sch.schemaName, dumboSchema.schema.defaultName);
    assert.strictEqual(sch.tables.size, 1);
  });

  void it('should create a default database', () => {
    const db = database({
      public: schema('public', {
        users: table('users', {
          columns: {
            id: column('id', Varchar('max')),
          },
        }),
      }),
    });

    assert.strictEqual(db.databaseName, dumboSchema.database.defaultName);
    assert.strictEqual(db.schemas.size, 1);
    assert.ok(db.schemas.has('public'));
  });

  void it('should create a named database', () => {
    const db = database('myapp', {
      public: schema('public', {
        users: table('users', {
          columns: {
            id: column('id', Varchar('max')),
          },
        }),
      }),
    });

    assert.strictEqual(db.databaseName, 'myapp');
    assert.strictEqual(db.schemas.size, 1);
    assert.ok(db.schemas.has('public'));
    assert.ok(db.schemas.public !== undefined);
    assert.ok(db.schemas.public.tables.users !== undefined);
    assert.ok(db.schemas.public.tables.users.columns.id !== undefined);
  });

  void it('should handle DEFAULT_SCHEMA', () => {
    const db = database(
      'myapp',
      schema({
        users: table('users', {
          columns: {
            id: column('id', Varchar('max')),
          },
        }),
      }),
    );

    assert.strictEqual(db.databaseName, 'myapp');
    assert.strictEqual(db.schemas.size, 1);
    assert.ok(db.schemas.has(dumboSchema.schema.defaultName));
  });

  void it('should create schema from table names', () => {
    const sch = schema.from('public', ['users', 'posts']);
    assert.strictEqual(sch.schemaName, 'public');
    assert.strictEqual(sch.tables.size, 2);
  });

  void it('should create database from schema names', () => {
    const db = database.from('myapp', ['public', 'analytics']);
    assert.strictEqual(db.databaseName, 'myapp');
    assert.strictEqual(db.schemas.size, 2);
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
  foreignKeys: [foreignKey(['id'], ['public.profiles.user_id'])],
});

const _users2 = table('users', {
  columns: {
    id: column('id', Varchar('max'), { primaryKey: true, notNull: true }),
    email: column('email', Varchar('max'), { notNull: true }),
    name: column('name', Varchar('max')),
  },
  foreignKeys: [
    {
      columns: ['id'],
      references: ['public.profiles.user_id'],
    },
  ],
});

export const simpleDb = database(
  'myapp',
  schema({
    users,
  }),
);

// Database with multiple schemas
const multiSchemaDb = database('myapp', {
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
      foreignKeys: [
        {
          columns: ['userId'],
          references: ['public.users.id'],
        },
      ],
    }),
  }),
});

// Access using name-based maps
const publicSchema = multiSchemaDb.schemas.public;
const _usersTable = publicSchema.tables.users;

type Users = TableRowType<typeof _usersTable>;

type _IdColumnIsNonNullableString = Expect<Equal<Users['id'], string>>;
type _EmailColumnIsNonNullableString = Expect<Equal<Users['email'], string>>;
type _NameColumnIsNullableString = Expect<Equal<Users['name'], string | null>>;
type _MetadataColumnIsNullableObject = Expect<
  Equal<Users['metadata'], { preferences: string[] } | null>
>;

type UserColumns = TableColumnNames<typeof _usersTable>;

const _userColumns: UserColumns[] = ['id', 'email', 'name', 'metadata'];

void describe('Foreign Key Validation', () => {
  void it('should accept valid single foreign key', () => {
    const db = database('test', {
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
          foreignKeys: [
            { columns: ['user_id'], references: ['public.users.id'] },
          ],
        }),
      }),
    });

    assert.ok(db.schemas.public.tables.posts.foreignKeys);
    assert.deepStrictEqual(
      db.schemas.public.tables.posts.foreignKeys[0].columns,
      ['user_id'],
    );
  });

  void it('should accept valid composite foreign key', () => {
    const db = database('test', {
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
          foreignKeys: [
            {
              columns: ['user_id', 'tenant_id'],
              references: ['public.users.id', 'public.users.tenant_id'],
            },
          ],
        }),
      }),
    });

    assert.deepStrictEqual(
      db.schemas.public.tables.posts.foreignKeys[0].columns,
      ['user_id', 'tenant_id'],
    );
  });

  void it('should accept self-referential foreign key', () => {
    const db = database('test', {
      public: schema('public', {
        users: table('users', {
          columns: {
            id: column('id', Varchar('max')),
            manager_id: column('manager_id', Varchar('max')),
          },
          foreignKeys: [
            { columns: ['manager_id'], references: ['public.users.id'] },
          ] as const,
        }),
      }),
    });

    assert.ok(db.schemas.public.tables.users.foreignKeys);
    assert.deepStrictEqual(
      db.schemas.public.tables.users.foreignKeys[0].references,
      ['public.users.id'],
    );
  });

  void it('should accept multiple foreign keys in one table', () => {
    const db = database('test', {
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
          foreignKeys: [
            { columns: ['user_id'], references: ['public.users.id'] },
            { columns: ['author_id'], references: ['public.users.id'] },
          ] as const,
        }),
      }),
    });

    assert.strictEqual(db.schemas.public.tables.posts.foreignKeys.length, 2);
  });

  void it('should accept cross-schema foreign key', () => {
    const db = database('test', {
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
          foreignKeys: [
            { columns: ['user_id'], references: ['public.users.id'] },
          ],
        }),
      }),
    });

    assert.deepStrictEqual(
      db.schemas.analytics.tables.events.foreignKeys[0].references,
      ['public.users.id'],
    );
  });
});
