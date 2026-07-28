import assert from 'node:assert';
import { describe, expectTypeOf, it } from 'vitest';
import { JSONSerializer } from '../../serializer';
import { SQL } from '../../sql';
import { pgFormatter } from '../../../storage/postgresql/core/sql/formatter';
import { sqliteFormatter } from '../../../storage/sqlite/core/sql/formatter';
import { dumboSchema } from '../dumboSchema';
import { createTableSQL } from './createTableSQL';
import type { TableRowType } from './tableTypesInference';

type User = {
  email: string;
};

const documents = dumboSchema.table('documents', {
  columns: {
    _id: dumboSchema.column('_id', SQL.column.type.Text, {
      primaryKey: true,
      notNull: true,
    }),
    data: dumboSchema.column('data', SQL.column.type.JSON<User>(), {
      notNull: true,
    }),
    metadata: dumboSchema.column(
      'metadata',
      SQL.column.type.JSON<Record<string, unknown>>(),
      {
        notNull: true,
        default: SQL.literal('{}'),
      },
    ),
    version: dumboSchema.column('version', SQL.column.type.BigInteger, {
      notNull: true,
      default: 1n,
    }),
    archived: dumboSchema.column('archived', SQL.column.type.Boolean, {
      notNull: true,
      default: false,
    }),
    created: dumboSchema.column('created', SQL.column.type.Timestamptz, {
      notNull: true,
      default: SQL.plain('CURRENT_TIMESTAMP'),
    }),
  },
  primaryKey: ['_id'],
});

describe('creating a table from a Dumbo declaration', () => {
  it('creates PostgreSQL DDL with portable document column types and constraints', () => {
    const result = pgFormatter.format(
      createTableSQL(documents, SQL.identifier('documents')),
      { serializer: JSONSerializer },
    );

    assert.strictEqual(
      result.query,
      "CREATE TABLE IF NOT EXISTS documents (_id TEXT PRIMARY KEY NOT NULL, data JSONB NOT NULL, metadata JSONB NOT NULL DEFAULT '{}', version BIGINT NOT NULL DEFAULT 1, archived BOOLEAN NOT NULL DEFAULT FALSE, created TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    );
    assert.deepStrictEqual(result.params, []);
  });

  it('creates SQLite DDL with text JSON storage instead of blobs', () => {
    const result = sqliteFormatter.format(
      createTableSQL(documents, SQL.identifier('documents')),
      { serializer: JSONSerializer },
    );

    assert.strictEqual(
      result.query,
      "CREATE TABLE IF NOT EXISTS documents (_id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL, metadata TEXT NOT NULL DEFAULT '{}', version INTEGER NOT NULL DEFAULT 1, archived INTEGER NOT NULL DEFAULT FALSE, created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    );
    assert.deepStrictEqual(result.params, []);
    assert.strictEqual(result.query.includes('BLOB'), false);
  });

  it('infers portable column values from the declaration', () => {
    expectTypeOf<TableRowType<typeof documents>>().toEqualTypeOf<{
      _id: string;
      data: User;
      metadata: Record<string, unknown>;
      version: bigint;
      archived: boolean;
      created: Date;
    }>();
  });
});
