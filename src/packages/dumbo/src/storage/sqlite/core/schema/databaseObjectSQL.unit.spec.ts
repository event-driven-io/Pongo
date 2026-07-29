import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  indexComponent,
  JSONSerializer,
  jsonDocumentIndexTarget,
  jsonPathIndexTarget,
  SQL,
  type IndexIdentifier,
} from '../../../../core';
import { sqliteFormatter } from '../sql';
import { sqliteIndexSQL, sqliteTableReference } from './databaseObjectSQL';

const format = (sql: SQL): string =>
  sqliteFormatter.format(sql, { serializer: JSONSerializer }).query;

const identifier = {
  databaseName: 'app',
  databaseSchemaName: 'crm',
  tableName: 'users',
  indexName: 'users_email_idx',
} satisfies IndexIdentifier;

describe('using Dumbo components in logical SQLite schemas', () => {
  it('resolves mapped table references from their full logical identifier', () => {
    assert.strictEqual(
      format(sqliteTableReference(identifier)),
      'dumbo_crm_table_users',
    );
    assert.strictEqual(
      format(
        sqliteTableReference({
          ...identifier,
          databaseSchemaName: 'main',
        }),
      ),
      'users',
    );
  });

  it('creates an index for ordinary columns', () => {
    const index = indexComponent({
      indexName: 'users_email_idx',
      columnNames: ['email'],
      isUnique: true,
    });

    assert.strictEqual(
      format(sqliteIndexSQL(index, identifier)),
      'CREATE UNIQUE INDEX dumbo_crm_table_users_index_users__email__idx ON dumbo_crm_table_users (email)',
    );
  });

  it('creates an index for a JSON path', () => {
    const index = indexComponent({
      indexName: 'users_email_idx',
      columnNames: ['data'],
      isUnique: false,
      target: jsonPathIndexTarget('data', ['profile', 'email']),
    });

    assert.strictEqual(
      format(sqliteIndexSQL(index, identifier)),
      "CREATE INDEX dumbo_crm_table_users_index_users__email__idx ON dumbo_crm_table_users (json_extract(data, '$.profile.email'))",
    );
  });

  it('creates an index for a JSON document', () => {
    const index = indexComponent({
      indexName: 'users_document_idx',
      columnNames: ['data'],
      isUnique: false,
      target: jsonDocumentIndexTarget('data'),
    });

    assert.strictEqual(
      format(
        sqliteIndexSQL(index, {
          ...identifier,
          indexName: 'users_document_idx',
        }),
      ),
      'CREATE INDEX dumbo_crm_table_users_index_users__document__idx ON dumbo_crm_table_users (data)',
    );
  });

  it('passes resolved references to custom index SQL', () => {
    const index = indexComponent({
      indexName: 'users_custom_idx',
      columnNames: ['data'],
      isUnique: false,
      sql: ({ tableReference, indexReference }) =>
        SQL`CREATE INDEX ${indexReference} ON ${tableReference} (data)`,
    });

    assert.strictEqual(
      format(
        sqliteIndexSQL(index, {
          ...identifier,
          indexName: 'users_custom_idx',
        }),
      ),
      'CREATE INDEX dumbo_crm_table_users_index_users__custom__idx ON dumbo_crm_table_users (data)',
    );
  });
});
