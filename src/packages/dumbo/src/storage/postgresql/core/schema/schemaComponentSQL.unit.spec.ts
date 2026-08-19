import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  createIndexSQL,
  databaseSchemaComponent,
  indexComponent,
  JSONSerializer,
  jsonDocumentIndexTarget,
  jsonPathIndexTarget,
  SQL,
  SQLDefaultSchemaNameToken,
} from '../../../../core';
import { pgFormatter } from '../sql';
import { postgreSQLTableReference } from './schemaComponentSQL';

const format = (sql: SQL): string =>
  pgFormatter.format(sql, { serializer: JSONSerializer }).query;

const identifier = {
  databaseSchemaName: 'audit',
  tableName: 'users',
  indexName: 'users_email_idx',
} satisfies Parameters<typeof createIndexSQL>[1];

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
      'public.users',
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

  it('creates a named schema and emits no migration for the default one', () => {
    const schemaSQLs = (
      schemaName: string | SQLDefaultSchemaNameToken,
    ): ReadonlyArray<string> =>
      databaseSchemaComponent({ schemaName })
        .migrations()
        .flatMap((migration) => migration.sqls)
        .map(format);

    assert.deepStrictEqual(schemaSQLs('audit'), [
      'CREATE SCHEMA IF NOT EXISTS audit',
    ]);
    assert.deepStrictEqual(schemaSQLs('public'), [
      'CREATE SCHEMA IF NOT EXISTS public',
    ]);
    assert.deepStrictEqual(schemaSQLs(SQLDefaultSchemaNameToken.from()), []);
  });

  it('creates an index for ordinary columns', () => {
    const index = indexComponent({
      indexName: 'users_email_idx',
      columnNames: ['email'],
      isUnique: true,
    });

    assert.strictEqual(
      format(createIndexSQL(index, identifier)),
      'CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON audit.users (email)',
    );
  });

  it('creates an index over several columns', () => {
    const index = indexComponent({
      indexName: 'users_email_idx',
      columnNames: ['email', 'tenant'],
      isUnique: false,
    });

    assert.strictEqual(
      format(createIndexSQL(index, identifier)),
      'CREATE INDEX IF NOT EXISTS users_email_idx ON audit.users (email, tenant)',
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
      format(createIndexSQL(index, identifier)),
      "CREATE INDEX IF NOT EXISTS users_email_idx ON audit.users ((data #>> '{profile,email}'))",
    );
  });

  it('keeps a JSON path segment containing a dot as one segment', () => {
    const index = indexComponent({
      indexName: 'users_email_idx',
      columnNames: ['data'],
      isUnique: false,
      target: jsonPathIndexTarget('data', ['user.name']),
    });

    assert.strictEqual(
      format(createIndexSQL(index, identifier)),
      'CREATE INDEX IF NOT EXISTS users_email_idx ON audit.users ((data #>> \'{"user.name"}\'))',
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
        createIndexSQL(index, {
          ...identifier,
          indexName: 'users_document_idx',
        }),
      ),
      'CREATE INDEX IF NOT EXISTS users_document_idx ON audit.users USING GIN (data)',
    );
  });

  it('creates a unique JSON document index as a btree index, not GIN', () => {
    const index = indexComponent({
      indexName: 'users_document_uq',
      columnNames: ['data'],
      isUnique: true,
      target: jsonDocumentIndexTarget('data'),
    });

    assert.strictEqual(
      format(
        createIndexSQL(index, {
          ...identifier,
          indexName: 'users_document_uq',
        }),
      ),
      'CREATE UNIQUE INDEX IF NOT EXISTS users_document_uq ON audit.users (data)',
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
        createIndexSQL(index, {
          ...identifier,
          indexName: 'users_custom_idx',
        }),
      ),
      'CREATE INDEX users_custom_idx ON audit.users USING GIN (data jsonb_path_ops)',
    );
  });
});
