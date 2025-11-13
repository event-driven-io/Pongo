import assert from 'node:assert';
import { describe, it } from 'node:test';
import { SQL } from '../../sql';
import { dumboSchema } from './index';

const { database, schema, table, column, index } = dumboSchema;
const { Varchar } = SQL.column.type;

void describe('dumboSchema', () => {
  void it('should create a column', () => {
    const col = column('id', {
      type: Varchar('max'),
    });
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
        id: column('id', {
          type: Varchar('max'),
        }),
        email: column('email', {
          type: Varchar('max'),
        }),
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
  });

  void it('should create a named schema', () => {
    const sch = schema('public', {
      users: table('users', {
        columns: {
          id: column('id', {
            type: Varchar('max'),
          }),
        },
      }),
    });

    assert.strictEqual(sch.schemaName, 'public');
    assert.strictEqual(sch.tables.size, 1);
    assert.ok(sch.tables.has('users'));
  });

  void it('should create a default schema without name', () => {
    const sch = schema({
      users: table('users', {
        columns: {
          id: column('id', {
            type: Varchar('max'),
          }),
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
            id: column('id', {
              type: Varchar('max'),
            }),
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
            id: column('id', {
              type: Varchar('max'),
            }),
          },
        }),
      }),
    });

    assert.strictEqual(db.databaseName, 'myapp');
    assert.strictEqual(db.schemas.size, 1);
    assert.ok(db.schemas.has('public'));
  });

  void it('should handle DEFAULT_SCHEMA', () => {
    const db = database(
      'myapp',
      schema({
        users: table('users', {
          columns: {
            id: column('id', {
              type: Varchar('max'),
            }),
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
    id: column('id', {
      type: Varchar('max'),
    }),
    email: column('email', {
      type: Varchar('max'),
    }),
    name: column('name', {
      type: Varchar('max'),
    }),
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
        id: column('id', {
          type: Varchar('max'),
        }),
        email: column('email', {
          type: Varchar('max'),
        }),
      },
    }),
  }),
  analytics: schema('analytics', {
    events: table('events', {
      columns: {
        id: column('id', {
          type: Varchar('max'),
        }),
        user_id: column('user_id', {
          type: Varchar('max'),
        }),
        timestamp: column('timestamp', {
          type: Varchar('max'),
        }),
      },
    }),
  }),
});

// Access using name-based maps
const publicSchema = multiSchemaDb.schemas.get('public');
const usersTable = publicSchema?.tables.get('users');
export const emailColumn = usersTable?.columns.get('email');
