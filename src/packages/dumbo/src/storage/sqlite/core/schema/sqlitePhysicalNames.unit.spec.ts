import assert from 'node:assert';
import { describe, it } from 'vitest';
import {
  SQLDefaultSchemaNameToken,
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
        databaseSchemaName: SQLDefaultSchemaNameToken.from(),
      }),
      'users',
    );
    assert.strictEqual(
      sqliteIndexName({
        ...index,
        databaseSchemaName: SQLDefaultSchemaNameToken.from(),
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
          databaseSchemaName: SQLDefaultSchemaNameToken.from(),
          tableName: 'crm.users',
        }),
      /SQLite table names containing \. are reserved/,
    );
    assert.throws(
      () =>
        sqliteIndexName({
          databaseSchemaName: SQLDefaultSchemaNameToken.from(),
          tableName: 'users',
          indexName: 'users.email_idx',
        }),
      /SQLite index names containing \. are reserved/,
    );
  });
});
