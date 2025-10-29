import assert from 'node:assert';
import { describe, it } from 'node:test';
import { dumboSchema } from './index';

void describe('dumboSchema', () => {
  void it('should create a column', () => {
    const col = dumboSchema.column('id');
    assert.strictEqual(col.columnName, 'id');
  });

  void it('should create an index', () => {
    const idx = dumboSchema.index('idx_email', ['email']);
    assert.strictEqual(idx.indexName, 'idx_email');
    assert.strictEqual(idx.isUnique, false);
  });

  void it('should create a unique index', () => {
    const idx = dumboSchema.index('idx_email', ['email'], { unique: true });
    assert.strictEqual(idx.indexName, 'idx_email');
    assert.strictEqual(idx.isUnique, true);
  });

  void it('should create a table with columns and indexes', () => {
    const tbl = dumboSchema.table('users', {
      columns: {
        id: dumboSchema.column('id'),
        email: dumboSchema.column('email'),
      },
      indexes: {
        idx_email: dumboSchema.index('idx_email', ['email']),
      },
    });

    assert.strictEqual(tbl.tableName, 'users');
    assert.strictEqual(tbl.columns.size, 2);
    assert.strictEqual(tbl.indexes.size, 1);
    assert.ok(tbl.columns.has('id'));
    assert.ok(tbl.columns.has('email'));
    assert.ok(tbl.indexes.has('idx_email'));
  });

  void it('should create a named schema', () => {
    const sch = dumboSchema.schema('public', {
      users: dumboSchema.table('users', {
        columns: {
          id: dumboSchema.column('id'),
        },
      }),
    });

    assert.strictEqual(sch.schemaName, 'public');
    assert.strictEqual(sch.tables.size, 1);
    assert.ok(sch.tables.has('users'));
  });

  void it('should create a default schema without name', () => {
    const sch = dumboSchema.schema({
      users: dumboSchema.table('users', {
        columns: {
          id: dumboSchema.column('id'),
        },
      }),
    });

    assert.strictEqual(sch.schemaName, dumboSchema.schema.defaultName);
    assert.strictEqual(sch.tables.size, 1);
  });

  void it('should create a default database', () => {
    const db = dumboSchema.database({
      public: dumboSchema.schema('public', {
        users: dumboSchema.table('users', {
          columns: {
            id: dumboSchema.column('id'),
          },
        }),
      }),
    });

    assert.strictEqual(db.databaseName, dumboSchema.database.defaultName);
    assert.strictEqual(db.schemas.size, 1);
    assert.ok(db.schemas.has('public'));
  });

  void it('should create a named database', () => {
    const db = dumboSchema.database('myapp', {
      public: dumboSchema.schema('public', {
        users: dumboSchema.table('users', {
          columns: {
            id: dumboSchema.column('id'),
          },
        }),
      }),
    });

    assert.strictEqual(db.databaseName, 'myapp');
    assert.strictEqual(db.schemas.size, 1);
    assert.ok(db.schemas.has('public'));
  });

  void it('should handle DEFAULT_SCHEMA', () => {
    const db = dumboSchema.database(
      'myapp',
      dumboSchema.schema({
        users: dumboSchema.table('users', {
          columns: {
            id: dumboSchema.column('id'),
          },
        }),
      }),
    );

    assert.strictEqual(db.databaseName, 'myapp');
    assert.strictEqual(db.schemas.size, 1);
    assert.ok(db.schemas.has(dumboSchema.schema.defaultName));
  });

  void it('should create schema from table names', () => {
    const sch = dumboSchema.schema.from('public', ['users', 'posts']);
    assert.strictEqual(sch.schemaName, 'public');
    assert.strictEqual(sch.tables.size, 2);
  });

  void it('should create database from schema names', () => {
    const db = dumboSchema.database.from('myapp', ['public', 'analytics']);
    assert.strictEqual(db.databaseName, 'myapp');
    assert.strictEqual(db.schemas.size, 2);
  });
});

// Samples

// Simple database with tables in default schema
export const simpleDb = dumboSchema.database(
  'myapp',
  dumboSchema.schema({
    users: dumboSchema.table('users', {
      columns: {
        id: dumboSchema.column('id'),
        email: dumboSchema.column('email'),
        name: dumboSchema.column('name'),
      },
      indexes: {
        idx_email: dumboSchema.index('idx_email', ['email'], {
          unique: true,
        }),
      },
    }),
  }),
);

// Database with multiple schemas
const multiSchemaDb = dumboSchema.database('myapp', {
  public: dumboSchema.schema('public', {
    users: dumboSchema.table('users', {
      columns: {
        id: dumboSchema.column('id'),
        email: dumboSchema.column('email'),
      },
    }),
  }),
  analytics: dumboSchema.schema('analytics', {
    events: dumboSchema.table('events', {
      columns: {
        id: dumboSchema.column('id'),
        user_id: dumboSchema.column('user_id'),
        timestamp: dumboSchema.column('timestamp'),
      },
    }),
  }),
});

// Access using name-based maps
const publicSchema = multiSchemaDb.schemas.get('public');
const usersTable = publicSchema?.tables.get('users');
export const emailColumn = usersTable?.columns.get('email');
