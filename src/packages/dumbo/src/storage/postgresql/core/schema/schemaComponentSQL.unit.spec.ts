import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  indexComponent,
  JSONSerializer,
  jsonDocumentIndexTarget,
  jsonPathIndexTarget,
  SQL,
  SQLDefaultSchemaNameToken,
  type IndexIdentifier,
} from '../../../../core';
import { pgFormatter } from '../sql';
import {
  postgreSQLDatabaseSchemaSQL,
  postgreSQLIndexSQL,
  postgreSQLTableReference,
} from './schemaComponentSQL';

const format = (sql: SQL): string =>
  pgFormatter.format(sql, { serializer: JSONSerializer }).query;

const identifier = {
  databaseSchemaName: 'audit',
  tableName: 'users',
  indexName: 'users_email_idx',
} satisfies IndexIdentifier;

describe('using Dumbo components in PostgreSQL schemas', () => {
  it('resolves table references from their full logical identifier', () => {
    assert.strictEqual(
      format(postgreSQLTableReference(identifier)),
      'audit.users',
    );
    assert.strictEqual(
      format(
        postgreSQLTableReference({
          ...identifier,
          databaseSchemaName: 'public',
        }),
      ),
      'users',
    );
    assert.strictEqual(
      format(
        postgreSQLTableReference({
          ...identifier,
          databaseSchemaName: SQLDefaultSchemaNameToken.from(),
        }),
      ),
      'users',
    );
  });

  it('creates a named schema and leaves the default one alone', () => {
    assert.strictEqual(
      format(postgreSQLDatabaseSchemaSQL(identifier)!),
      'CREATE SCHEMA IF NOT EXISTS audit',
    );
    assert.strictEqual(
      postgreSQLDatabaseSchemaSQL({ databaseSchemaName: 'public' }),
      undefined,
    );
    assert.strictEqual(
      postgreSQLDatabaseSchemaSQL({
        databaseSchemaName: SQLDefaultSchemaNameToken.from(),
      }),
      undefined,
    );
  });

  it('creates an index for ordinary columns', () => {
    const index = indexComponent({
      indexName: 'users_email_idx',
      columnNames: ['email'],
      isUnique: true,
    });

    assert.strictEqual(
      format(postgreSQLIndexSQL(index, identifier)),
      'CREATE UNIQUE INDEX users_email_idx ON audit.users (email)',
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
      format(postgreSQLIndexSQL(index, identifier)),
      "CREATE INDEX users_email_idx ON audit.users ((data #>> '{profile,email}'))",
    );
  });

  it('creates a GIN index for a JSON document', () => {
    const index = indexComponent({
      indexName: 'users_document_idx',
      columnNames: ['data'],
      isUnique: false,
      target: jsonDocumentIndexTarget('data'),
    });

    assert.strictEqual(
      format(
        postgreSQLIndexSQL(index, {
          ...identifier,
          indexName: 'users_document_idx',
        }),
      ),
      'CREATE INDEX users_document_idx ON audit.users USING GIN (data)',
    );
  });

  it('passes resolved references to custom index SQL', () => {
    const index = indexComponent({
      indexName: 'users_custom_idx',
      columnNames: ['data'],
      isUnique: false,
      sql: ({ tableReference, indexReference }) =>
        SQL`CREATE INDEX ${indexReference} ON ${tableReference} USING GIN (data jsonb_path_ops)`,
    });

    assert.strictEqual(
      format(
        postgreSQLIndexSQL(index, {
          ...identifier,
          indexName: 'users_custom_idx',
        }),
      ),
      'CREATE INDEX users_custom_idx ON audit.users USING GIN (data jsonb_path_ops)',
    );
  });
});
