import assert from 'node:assert';
import { describe, it } from 'vitest';
import { JSONSerializer } from '../../../../../core';
import {
  SQL,
  SQLCreateSchema,
  SQLDefaultSchemaNameToken,
  SQLTableReference,
} from '../../../../../core/sql';
import { sqliteFormatter } from '.';

const format = (sql: SQL): string =>
  sqliteFormatter.format(sql, { serializer: JSONSerializer }).query;

const tableIn = (
  databaseSchemaName: string | SQLDefaultSchemaNameToken,
  tableName = 'users',
) => SQL`${SQLTableReference.from({ databaseSchemaName, tableName })}`;

const createSchema = (databaseSchemaName: string | SQLDefaultSchemaNameToken) =>
  SQL`${SQLCreateSchema.from({ databaseSchemaName })}`;

describe('declaring a table and running it on SQLite', () => {
  it('reads a named schema as part of the name', () => {
    assert.strictEqual(format(tableIn('crm')), '"crm.users"');
  });

  it('drops the qualifier for the default schema', () => {
    assert.strictEqual(
      format(tableIn(SQLDefaultSchemaNameToken.from())),
      'users',
    );
  });

  it('treats a spelled-out default schema name as a named schema', () => {
    assert.strictEqual(format(tableIn('public')), '"public.users"');
    assert.strictEqual(format(tableIn('main')), '"main.users"');
  });

  it('keeps schemas that differ only by underscores on separate tables', () => {
    assert.notStrictEqual(
      format(tableIn('a', 'b_c')),
      format(tableIn('a_b', 'c')),
    );
  });

  it('quotes the folded logical name as one SQLite identifier', () => {
    assert.strictEqual(format(tableIn('order', 'user')), '"order.user"');
  });

  it('refuses a native SQLite table name that would collide with a mapped one', () => {
    const reserved = tableIn(SQLDefaultSchemaNameToken.from(), 'crm.users');

    assert.throws(
      () => sqliteFormatter.format(reserved, { serializer: JSONSerializer }),
      /SQLite table names containing \. are reserved/,
    );
  });

  it('composes into a statement instead of only standing alone', () => {
    assert.strictEqual(
      format(SQL`SELECT ${SQL.identifier('email')} FROM ${tableIn('crm')}`),
      'SELECT email FROM "crm.users"',
    );
  });
});

describe('creating the schema a table was declared in on SQLite', () => {
  it('creates nothing for a named schema on schemaless SQLite', () => {
    assert.strictEqual(format(createSchema('crm')), '');
  });

  it('creates nothing for the default schema', () => {
    assert.strictEqual(
      format(createSchema(SQLDefaultSchemaNameToken.from())),
      '',
    );
  });
});
