import assert from 'node:assert';
import { describe, it } from 'vitest';
import { pgFormatter } from '../../../storage/postgresql/core/sql/formatter';
import { sqliteFormatter } from '../../../storage/sqlite/core/sql/formatter';
import { JSONSerializer } from '../../serializer';
import { SQL } from '../sql';
import {
  SQLCreateSchema,
  SQLDefaultSchemaNameToken,
  SQLTableReference,
} from './sqlToken';

const formatted = (sql: SQL) => ({
  postgreSQL: pgFormatter.format(sql, { serializer: JSONSerializer }).query,
  sqlite: sqliteFormatter.format(sql, { serializer: JSONSerializer }).query,
});

const tableIn = (
  databaseSchemaName: string | SQLDefaultSchemaNameToken,
  tableName = 'users',
) => SQL`${SQLTableReference.from({ databaseSchemaName, tableName })}`;

const createSchema = (databaseSchemaName: string | SQLDefaultSchemaNameToken) =>
  SQL`${SQLCreateSchema.from({ databaseSchemaName })}`;

describe('declaring a table once and running it on every dialect', () => {
  it('reads a named schema as a qualifier on PostgreSQL and as part of the name on SQLite', () => {
    assert.deepStrictEqual(formatted(tableIn('crm')), {
      postgreSQL: 'crm.users',
      sqlite: 'dumbo_crm_table_users',
    });
  });

  it('drops the qualifier everywhere for the default schema', () => {
    assert.deepStrictEqual(
      formatted(tableIn(SQLDefaultSchemaNameToken.from())),
      {
        postgreSQL: 'users',
        sqlite: 'users',
      },
    );
  });

  it('treats a spelled-out default schema name as default on that dialect only', () => {
    assert.deepStrictEqual(formatted(tableIn('public')), {
      postgreSQL: 'users',
      sqlite: 'dumbo_public_table_users',
    });
    assert.deepStrictEqual(formatted(tableIn('main')), {
      postgreSQL: 'main.users',
      sqlite: 'users',
    });
  });

  it('keeps schemas that differ only by underscores on separate tables', () => {
    assert.notDeepStrictEqual(
      formatted(tableIn('a', 'b_c')),
      formatted(tableIn('a_b', 'c')),
    );
  });

  it('quotes reserved words, and needs no quoting once SQLite has folded them in', () => {
    assert.deepStrictEqual(formatted(tableIn('order', 'user')), {
      postgreSQL: '"order"."user"',
      sqlite: 'dumbo_order_table_user',
    });
  });

  it('refuses a native SQLite table name that would collide with a mapped one', () => {
    const reserved = tableIn(SQLDefaultSchemaNameToken.from(), 'dumbo_users');

    assert.strictEqual(
      pgFormatter.format(reserved, { serializer: JSONSerializer }).query,
      'dumbo_users',
    );
    assert.throws(
      () => sqliteFormatter.format(reserved, { serializer: JSONSerializer }),
      /SQLite table names starting with dumbo_ are reserved/,
    );
  });

  it('composes into a statement instead of only standing alone', () => {
    assert.deepStrictEqual(
      formatted(SQL`SELECT ${SQL.identifier('email')} FROM ${tableIn('crm')}`),
      {
        postgreSQL: 'SELECT email FROM crm.users',
        sqlite: 'SELECT email FROM dumbo_crm_table_users',
      },
    );
  });
});

describe('creating the schema a table was declared in', () => {
  it('creates a named schema on PostgreSQL and nothing on schemaless SQLite', () => {
    assert.deepStrictEqual(formatted(createSchema('crm')), {
      postgreSQL: 'CREATE SCHEMA IF NOT EXISTS crm',
      sqlite: '',
    });
  });

  it('creates nothing for the default schema', () => {
    assert.deepStrictEqual(
      formatted(createSchema(SQLDefaultSchemaNameToken.from())),
      { postgreSQL: '', sqlite: '' },
    );
    assert.deepStrictEqual(formatted(createSchema('public')).postgreSQL, '');
  });

  it('quotes a reserved schema name', () => {
    assert.strictEqual(
      formatted(createSchema('order')).postgreSQL,
      'CREATE SCHEMA IF NOT EXISTS "order"',
    );
  });
});
