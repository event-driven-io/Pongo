import assert from 'node:assert';
import { describe, it } from 'node:test';
import { SQL } from '../../sql';
import type { Equal, Expect } from '../../testing';
import type { TableColumnNames, TableRowType } from '../components';
import { dumboSchema } from './index';

const { database, schema, table, column, index } = dumboSchema;
const { Varchar } = SQL.column.type;

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
        id: column('id', Varchar('max'), { primaryKey: true, notNull: true }),
        email: column('email', Varchar('max'), { notNull: true }),
        name: column('name', Varchar('max')),
      },
    }),
  }),
  analytics: schema('analytics', {
    events: table('events', {
      columns: {
        id: column('id', Varchar('max')),
        userId: column('user_id', Varchar('max')),
        timestamp: column('timestamp', Varchar('max')),
      },
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

type UserColumns = TableColumnNames<typeof _usersTable>;

const _userColumns: UserColumns[] = ['id', 'email', 'name'];
