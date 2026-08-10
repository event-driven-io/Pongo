import assert from 'node:assert';
import { describe, it } from 'vitest';
import type { IndexIdentifier, TableIdentifier } from '../../../../core';
import { sqliteIndexName, sqliteTableName } from './sqlitePhysicalNames';

describe('using logical database schemas in SQLite', () => {
  it('keeps table and index names unchanged in the native schema', () => {
    const table = {
      databaseSchemaName: 'main',
      tableName: 'users',
    } satisfies TableIdentifier;
    const index = {
      ...table,
      indexName: 'users_email_idx',
    } satisfies IndexIdentifier;

    assert.strictEqual(sqliteTableName(table), 'users');
    assert.strictEqual(sqliteIndexName(index), 'users_email_idx');
  });

  it('maps tables and indexes from logical schemas to SQLite object names', () => {
    const table = {
      databaseSchemaName: 'crm',
      tableName: 'users',
    } satisfies TableIdentifier;
    const index = {
      ...table,
      indexName: 'users_email_idx',
    } satisfies IndexIdentifier;

    assert.strictEqual(sqliteTableName(table), 'dumbo_crm_table_users');
    assert.strictEqual(
      sqliteIndexName(index),
      'dumbo_crm_table_users_index_users__email__idx',
    );
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

  it('reserves the mapped prefix in the native SQLite namespace', () => {
    assert.throws(
      () =>
        sqliteTableName({
          databaseSchemaName: 'main',
          tableName: 'dumbo_users',
        }),
      /SQLite table names starting with dumbo_ are reserved/,
    );
    assert.throws(
      () =>
        sqliteIndexName({
          databaseSchemaName: 'main',
          tableName: 'users',
          indexName: 'dumbo_users_email_idx',
        }),
      /SQLite index names starting with dumbo_ are reserved/,
    );
  });
});
