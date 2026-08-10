import { SQLDefaultSchemaNameToken } from '@event-driven-io/dumbo';
import assert from 'node:assert';
import { describe, it } from 'vitest';
import {
  pongoCollectionMigrationName,
  pongoIndexMigrationName,
} from './migrationNames';

describe('naming migrations for a collection', () => {
  it('gives a named schema its own segment', () => {
    assert.strictEqual(
      pongoCollectionMigrationName(
        { databaseSchemaName: 'reporting', tableName: 'users' },
        'public',
      ),
      'pongoCollection:reporting:users:001:createtable',
    );
  });

  it('gives the default schema no segment', () => {
    assert.strictEqual(
      pongoCollectionMigrationName(
        {
          databaseSchemaName: SQLDefaultSchemaNameToken.from(),
          tableName: 'users',
        },
        'public',
      ),
      'pongoCollection:users:001:createtable',
    );
  });

  it('gives an index in the default schema no schema segment', () => {
    assert.strictEqual(
      pongoIndexMigrationName({
        databaseSchemaName: SQLDefaultSchemaNameToken.from(),
        tableName: 'users',
        indexName: 'users_email_idx',
      }),
      'pongoIndex:users:users_email_idx:create',
    );
  });
});
