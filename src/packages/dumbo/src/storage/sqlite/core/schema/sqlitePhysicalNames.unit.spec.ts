import assert from 'node:assert';
import { describe, it } from 'vitest';
import {
  DefaultDatabaseSchemaName,
  type SQLIndexReference,
  type SQLTableReference,
} from '../../../../core';
import { sqliteIndexName, sqliteTableName } from './sqlitePhysicalNames';

describe('using logical database schemas in SQLite', () => {
  it('keeps table and index names unchanged only for the default schema token', () => {
    const table = {
      databaseSchemaName: 'main',
      tableName: 'users',
    } satisfies Omit<SQLTableReference, 'sqlTokenType'>;
    const index = {
      ...table,
      indexName: 'users_email_idx',
    } satisfies Omit<SQLIndexReference, 'sqlTokenType'>;

    assert.strictEqual(
      sqliteTableName({
        ...table,
        databaseSchemaName: DefaultDatabaseSchemaName,
      }),
      'users',
    );
    assert.strictEqual(
      sqliteIndexName({
        ...index,
        databaseSchemaName: DefaultDatabaseSchemaName,
      }),
      'users_email_idx',
    );
    assert.strictEqual(sqliteTableName(table), 'main.users');
    assert.strictEqual(sqliteIndexName(index), 'main.users_email_idx');
  });

  it('maps tables and indexes from logical schemas to SQLite object names', () => {
    const table = {
      databaseSchemaName: 'crm',
      tableName: 'users',
    } satisfies Omit<SQLTableReference, 'sqlTokenType'>;
    const index = {
      ...table,
      indexName: 'users_email_idx',
    } satisfies Omit<SQLIndexReference, 'sqlTokenType'>;

    assert.strictEqual(sqliteTableName(table), 'crm.users');
    assert.strictEqual(sqliteIndexName(index), 'crm.users_email_idx');
  });

  it('keeps underscore-containing logical tuples distinct', () => {
    const names = [
      { databaseSchemaName: 'a', tableName: 'b_c' },
      { databaseSchemaName: 'a_b', tableName: 'c' },
      { databaseSchemaName: 'a_', tableName: '_b' },
      { databaseSchemaName: 'a__', tableName: 'b' },
    ].map(({ databaseSchemaName, tableName }) =>
      sqliteTableName({ databaseSchemaName, tableName }),
    );

    assert.strictEqual(new Set(names).size, names.length);
  });

  it('reserves dotted names in the native SQLite namespace', () => {
    assert.throws(
      () =>
        sqliteTableName({
          databaseSchemaName: DefaultDatabaseSchemaName,
          tableName: 'crm.users',
        }),
      /SQLite table names containing \. are reserved/,
    );
    assert.throws(
      () =>
        sqliteIndexName({
          databaseSchemaName: DefaultDatabaseSchemaName,
          tableName: 'users',
          indexName: 'users.email_idx',
        }),
      /SQLite index names containing \. are reserved/,
    );
  });

  it('keeps two distinct logical placements from folding onto one physical name', () => {
    assert.throws(
      () =>
        sqliteTableName({
          databaseSchemaName: 'crm',
          tableName: 'a.b',
        }),
      /SQLite table names containing \. are reserved/,
    );
    assert.throws(
      () =>
        sqliteTableName({
          databaseSchemaName: 'crm.a',
          tableName: 'b',
        }),
      /SQLite database schema names containing \. are reserved/,
    );
    assert.throws(
      () =>
        sqliteIndexName({
          databaseSchemaName: 'crm',
          tableName: 'users',
          indexName: 'a.b',
        }),
      /SQLite index names containing \. are reserved/,
    );
  });
});
