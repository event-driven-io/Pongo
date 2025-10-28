import { describe, it } from 'node:test';
import assert from 'node:assert';
import { dumboSchema } from './index';

describe('dumboSchema', () => {
  it('should create a column', () => {
    const col = dumboSchema.column('id');
    assert.strictEqual(col.columnName, 'id');
  });

  it('should create an index', () => {
    const idx = dumboSchema.index('idx_email', ['email']);
    assert.strictEqual(idx.indexName, 'idx_email');
    assert.strictEqual(idx.isUnique, false);
  });

  it('should create a unique index', () => {
    const idx = dumboSchema.index('idx_email', ['email'], { unique: true });
    assert.strictEqual(idx.indexName, 'idx_email');
    assert.strictEqual(idx.isUnique, true);
  });

  it('should create a table with columns and indexes', () => {
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

  it('should create a named schema', () => {
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

  it('should create a default schema without name', () => {
    const sch = dumboSchema.schema({
      users: dumboSchema.table('users', {
        columns: {
          id: dumboSchema.column('id'),
        },
      }),
    });

    assert.strictEqual(sch.schemaName, '');
    assert.strictEqual(sch.tables.size, 1);
  });

  it('should create a named database', () => {
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

  it('should handle DEFAULT_SCHEMA', () => {
    const db = dumboSchema.database(
      'myapp',
      {
        [dumboSchema.DEFAULT_SCHEMA]: dumboSchema.schema({
          users: dumboSchema.table('users', {
            columns: {
              id: dumboSchema.column('id'),
            },
          }),
        }),
      },
      {
        defaultSchemaName: 'main',
      },
    );

    assert.strictEqual(db.databaseName, 'myapp');
    assert.strictEqual(db.schemas.size, 1);
    assert.ok(db.schemas.has('main'));
  });

  it('should create schema from table names', () => {
    const sch = dumboSchema.schema.from('public', ['users', 'posts']);
    assert.strictEqual(sch.schemaName, 'public');
    assert.strictEqual(sch.tables.size, 2);
  });

  it('should create database from schema names', () => {
    const db = dumboSchema.database.from('myapp', ['public', 'analytics']);
    assert.strictEqual(db.databaseName, 'myapp');
    assert.strictEqual(db.schemas.size, 2);
  });
});
