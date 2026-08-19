import assert from 'node:assert';
import { describe, it } from 'vitest';
import { pgFormatter } from '.';
import { JSONSerializer } from '../../../../../core';
import {
  DefaultDatabaseSchemaName,
  SQL,
  SQLCreateSchema,
  SQLTableReference,
} from '../../../../../core/sql';

const format = (sql: SQL): string =>
  pgFormatter.format(sql, { serializer: JSONSerializer }).query;

const tableIn = (databaseSchemaName: string, tableName = 'users') =>
  SQL`${SQLTableReference.from({ databaseSchemaName, tableName })}`;

const createSchema = (databaseSchemaName: string) =>
  SQL`${SQLCreateSchema.from({ databaseSchemaName })}`;

describe('declaring a table and running it on PostgreSQL', () => {
  it('reads a named schema as a qualifier', () => {
    assert.strictEqual(format(tableIn('crm')), 'crm.users');
  });

  it('drops the qualifier for the default schema', () => {
    assert.strictEqual(format(tableIn(DefaultDatabaseSchemaName)), 'users');
  });

  it('treats a spelled-out default schema name as a named schema', () => {
    assert.strictEqual(format(tableIn('public')), 'public.users');
  });

  it('keeps schemas that differ only by underscores on separate tables', () => {
    assert.notStrictEqual(
      format(tableIn('a', 'b_c')),
      format(tableIn('a_b', 'c')),
    );
  });

  it('quotes reserved words', () => {
    assert.strictEqual(format(tableIn('order', 'user')), '"order"."user"');
  });

  it('accepts a native table name that SQLite would reserve', () => {
    assert.strictEqual(
      format(tableIn(DefaultDatabaseSchemaName, 'dumbo_users')),
      'dumbo_users',
    );
  });

  it('composes into a statement instead of only standing alone', () => {
    assert.strictEqual(
      format(SQL`SELECT ${SQL.identifier('email')} FROM ${tableIn('crm')}`),
      'SELECT email FROM crm.users',
    );
  });
});

describe('creating the schema a table was declared in on PostgreSQL', () => {
  it('creates a named schema', () => {
    assert.strictEqual(
      format(createSchema('crm')),
      'CREATE SCHEMA IF NOT EXISTS crm',
    );
  });

  it('creates nothing for the default schema', () => {
    assert.strictEqual(format(createSchema(DefaultDatabaseSchemaName)), '');
  });

  it('creates an explicitly spelled default schema name as a named schema', () => {
    assert.strictEqual(
      format(createSchema('public')),
      'CREATE SCHEMA IF NOT EXISTS public',
    );
  });

  it('quotes a reserved schema name', () => {
    assert.strictEqual(
      format(createSchema('order')),
      'CREATE SCHEMA IF NOT EXISTS "order"',
    );
  });
});
