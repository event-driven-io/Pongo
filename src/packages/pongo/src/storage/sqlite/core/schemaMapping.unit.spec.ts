import { SQL } from '@event-driven-io/dumbo';
import type { ComponentContext } from '@event-driven-io/dumbo';
import { sqliteFormatter } from '@event-driven-io/dumbo/sqlite';
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  resolveSQLiteCollectionReference,
  resolveSQLiteIndexReference,
} from './schemaMapping';

const formatted = (sql: SQL): string => SQL.format(sql, sqliteFormatter).query;

describe('mapping logical Pongo names to SQLite objects', () => {
  it('keeps native main tables and indexes readable', () => {
    const context = {
      databaseName: 'app',
      databaseSchemaName: 'main',
      tableName: 'users',
    } satisfies ComponentContext;
    const collection = resolveSQLiteCollectionReference(context);
    const index = resolveSQLiteIndexReference(context, 'users_email_idx');

    assert.deepStrictEqual(
      {
        physicalName: collection.physicalName,
        tableReference: formatted(collection.tableReference),
        mapped: collection.mapped,
      },
      {
        physicalName: 'users',
        tableReference: 'users',
        mapped: false,
      },
    );
    assert.deepStrictEqual(
      {
        physicalName: index.physicalName,
        indexReference: formatted(index.indexReference),
      },
      {
        physicalName: 'users_email_idx',
        indexReference: 'users_email_idx',
      },
    );
  });

  it('maps schema-qualified tables and indexes from their full tuples', () => {
    const context = {
      databaseName: 'app',
      databaseSchemaName: 'crm',
      tableName: 'users',
    } satisfies ComponentContext;
    const collection = resolveSQLiteCollectionReference(context);
    const index = resolveSQLiteIndexReference(context, 'users_email_idx');

    assert.deepStrictEqual(
      {
        physicalName: collection.physicalName,
        tableReference: formatted(collection.tableReference),
        mapped: collection.mapped,
      },
      {
        physicalName: 'pongo_crm_table_users',
        tableReference: 'pongo_crm_table_users',
        mapped: true,
      },
    );
    assert.deepStrictEqual(
      {
        physicalName: index.physicalName,
        indexReference: formatted(index.indexReference),
      },
      {
        physicalName: 'pongo_crm_table_users_index_users__email__idx',
        indexReference: 'pongo_crm_table_users_index_users__email__idx',
      },
    );
  });

  it('keeps underscore-containing schema and table tuples distinct', () => {
    const physicalNames = [
      { databaseSchemaName: 'a', tableName: 'b_c' },
      { databaseSchemaName: 'a_b', tableName: 'c' },
      { databaseSchemaName: 'a_', tableName: '_b' },
      { databaseSchemaName: 'a__', tableName: 'b' },
    ].map(
      ({ databaseSchemaName, tableName }) =>
        resolveSQLiteCollectionReference({
          databaseName: 'app',
          databaseSchemaName,
          tableName,
        }).physicalName,
    );

    assert.strictEqual(new Set(physicalNames).size, physicalNames.length);
  });

  it('reserves the mapped-name prefix in SQLite main', () => {
    assert.throws(
      () =>
        resolveSQLiteCollectionReference({
          databaseName: 'app',
          databaseSchemaName: 'main',
          tableName: 'pongo_users',
        }),
      /SQLite collection names starting with pongo_ are reserved/,
    );

    assert.throws(
      () =>
        resolveSQLiteIndexReference(
          {
            databaseName: 'app',
            databaseSchemaName: 'main',
            tableName: 'users',
          },
          'pongo_users_email_idx',
        ),
      /SQLite index names starting with pongo_ are reserved/,
    );
  });

  it('requires a materialized schema and table context', () => {
    assert.throws(
      () => resolveSQLiteCollectionReference({ databaseName: 'app' }),
      /table context/,
    );
  });
});
