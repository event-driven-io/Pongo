import { JSONSerializer, SQL } from '@event-driven-io/dumbo';
import { pgFormatter } from '@event-driven-io/dumbo/pg';
import assert from 'assert';
import { describe, it } from 'vitest';
import { postgresSQLBuilder, pongoCollectionPostgreSQLMigrations } from '.';
import {
  pongoSchema,
  type ExpectedDocumentVersion,
  type PongoCollectionSQLBuilder,
} from '../../../../core';

const specialDocument = {
  _id: 'special-id',
  title: "director's cut",
  nested: {
    quote: "owner's copy",
    unicode: 'Zażółć gęślą jaźń',
    jsonLike: `{"title":"director's cut"}`,
    dateLike: '2024-07-15T16:30:00.000Z',
    bigintLike: '9007199254740993',
  },
  tags: ["can't", '東京', '$.path[0]'],
};
const specialDocumentJSON = JSONSerializer.serialize(specialDocument);

describe('bound JSON params', () => {
  const builder = postgresSQLBuilder('users', JSONSerializer);

  it('insertOne binds serialized document JSON without SQL escaping', () => {
    const result = builder.insertOne(specialDocument);
    const { params } = SQL.format(result, pgFormatter);

    assert.deepStrictEqual(params, [
      specialDocument._id,
      specialDocumentJSON,
      '1',
    ]);
  });

  it('insertMany binds serialized JSON without SQL escaping', () => {
    const result = builder.insertMany([specialDocument]);
    const { params } = SQL.format(result, pgFormatter);

    assert.deepStrictEqual(params, [
      specialDocument._id,
      specialDocumentJSON,
      '1',
    ]);
  });

  it('insertOrReplace binds serialized JSON without SQL escaping', () => {
    const result = builder.insertOrReplace([specialDocument]);
    const { params } = SQL.format(result, pgFormatter);

    assert.deepStrictEqual(params, [
      specialDocument._id,
      specialDocumentJSON,
      specialDocument._id,
    ]);
  });

  it('updateOne binds $set JSON without SQL escaping', () => {
    const patch = {
      title: specialDocument.title,
      nested: specialDocument.nested,
    };
    const result = builder.updateOne<typeof specialDocument>(
      { _id: specialDocument._id },
      { $set: patch },
    );
    const { params } = SQL.format(result, pgFormatter);

    assert.deepStrictEqual(params, [
      specialDocument._id,
      JSONSerializer.serialize(patch),
    ]);
  });

  it('updateMany binds $set JSON and filter params without SQL escaping', () => {
    const patch = {
      title: specialDocument.title,
      nested: specialDocument.nested,
    };
    const result = builder.updateMany<typeof specialDocument>(
      { title: specialDocument.title },
      { $set: patch },
    );
    const { params } = SQL.format(result, pgFormatter);

    assert.deepStrictEqual(params, [
      JSONSerializer.serialize(patch),
      JSONSerializer.serialize(specialDocument.title),
      JSONSerializer.serialize([specialDocument.title]),
    ]);
  });

  it('replaceOne binds replacement JSON without SQL escaping', () => {
    const replacement = {
      title: specialDocument.title,
      nested: specialDocument.nested,
      tags: specialDocument.tags,
    };
    const result = builder.replaceOne(
      { _id: specialDocument._id },
      replacement,
    );
    const { params } = SQL.format(result, pgFormatter);

    assert.deepStrictEqual(params, [
      specialDocument._id,
      JSONSerializer.serialize(replacement),
    ]);
  });

  it('replaceMany binds every serialized replacement without SQL escaping', () => {
    const secondDocument = {
      ...specialDocument,
      _id: 'special-id-2',
      title: "producer's notes",
      _version: 7n,
    };
    const result = builder.replaceMany([specialDocument, secondDocument]);
    const { params } = SQL.format(result, pgFormatter);

    assert.deepStrictEqual(params, [
      specialDocument._id,
      specialDocumentJSON,
      secondDocument._id,
      JSONSerializer.serialize(secondDocument),
      '7',
    ]);
  });

  it('find binds string filter values against the JSON field expression without SQL escaping', () => {
    const result = builder.find({
      title: specialDocument.title,
    });
    const { query, params } = SQL.format(result, pgFormatter);

    assert.ok(query.includes(`data -> 'title' = $1::jsonb`), `got: ${query}`);
    assert.ok(query.includes(`data -> 'title' @> $2::jsonb`), `got: ${query}`);
    assert.deepStrictEqual(params, [
      JSONSerializer.serialize(specialDocument.title),
      JSONSerializer.serialize([specialDocument.title]),
    ]);
  });

  it('find binds nested object equality values against the nested JSON field expression', () => {
    const result = builder.find({
      nested: { quote: specialDocument.nested.quote },
    });
    const { query, params } = SQL.format(result, pgFormatter);

    assert.ok(
      query.includes(`data #> '{nested,quote}' = $1::jsonb`),
      `got: ${query}`,
    );
    assert.ok(
      query.includes(`data #> '{nested,quote}' @> $2::jsonb`),
      `got: ${query}`,
    );
    assert.deepStrictEqual(params, [
      JSONSerializer.serialize(specialDocument.nested.quote),
      JSONSerializer.serialize([specialDocument.nested.quote]),
    ]);
  });

  it('find keeps apostrophes in field names escaped in inline JSON field paths', () => {
    const result = builder.find({
      "director's.title": specialDocument.title,
    });
    const { query, params } = SQL.format(result, pgFormatter);

    assert.ok(
      query.includes(`data #> '{"director''s",title}' = $1::jsonb`),
      `got: ${query}`,
    );
    assert.deepStrictEqual(params, [
      JSONSerializer.serialize(specialDocument.title),
      JSONSerializer.serialize([specialDocument.title]),
    ]);
  });
});

describe('postgres collection schema migrations', () => {
  const singleLine = (value: string) => value.replace(/\s+/g, ' ').trim();

  it('keeps default schema migrations unqualified for compatibility', () => {
    const migrations = pongoCollectionPostgreSQLMigrations(
      pongoSchema.collection('users'),
    );
    const { query } = SQL.format(migrations[0]!.sqls[0]!, pgFormatter);

    assert.strictEqual(
      migrations[0]!.name,
      'pongoCollection:users:001:createtable',
    );
    assert.ok(query.includes('CREATE TABLE IF NOT EXISTS users'));
  });

  it('creates and uses explicit PostgreSQL schemas', () => {
    const migrations = pongoCollectionPostgreSQLMigrations(
      pongoSchema.collection('users', { schema: 'crm' }),
    );
    const createSchema = SQL.format(migrations[0]!.sqls[0]!, pgFormatter);
    const createTable = SQL.format(migrations[0]!.sqls[1]!, pgFormatter);
    const builder = postgresSQLBuilder(
      pongoSchema.collection('users', { schema: 'crm' }),
      JSONSerializer,
    );
    const insert = SQL.format(
      builder.insertOne({ _id: '1', name: 'Oskar' }),
      pgFormatter,
    );

    assert.strictEqual(
      migrations[0]!.name,
      'pongoCollection:crm:users:001:createtable',
    );
    assert.ok(createSchema.query.includes('CREATE SCHEMA IF NOT EXISTS crm'));
    assert.ok(
      createTable.query.includes('CREATE TABLE IF NOT EXISTS crm.users'),
    );
    assert.ok(insert.query.includes('INSERT INTO crm.users'));
  });

  const runtimeSQLCases: {
    name: keyof PongoCollectionSQLBuilder;
    sql: (builder: PongoCollectionSQLBuilder) => SQL;
    defaultIncludes: string;
    schemaIncludes: string;
  }[] = [
    {
      name: 'createCollection',
      sql: (builder) => builder.createCollection(),
      defaultIncludes: 'CREATE TABLE IF NOT EXISTS users',
      schemaIncludes: 'CREATE TABLE IF NOT EXISTS crm.users',
    },
    {
      name: 'insertOne',
      sql: (builder) => builder.insertOne({ _id: '1', email: 'a@test' }),
      defaultIncludes: 'INSERT INTO users',
      schemaIncludes: 'INSERT INTO crm.users',
    },
    {
      name: 'insertMany',
      sql: (builder) => builder.insertMany([{ _id: '1', email: 'a@test' }]),
      defaultIncludes: 'INSERT INTO users',
      schemaIncludes: 'INSERT INTO crm.users',
    },
    {
      name: 'insertOrReplace',
      sql: (builder) =>
        builder.insertOrReplace([{ _id: '1', email: 'a@test' }]),
      defaultIncludes: 'INSERT INTO users',
      schemaIncludes: 'INSERT INTO crm.users',
    },
    {
      name: 'updateOne',
      sql: (builder) =>
        builder.updateOne<{ email: string; name: string }>(
          { email: 'a@test' },
          { $set: { name: 'A' } },
        ),
      defaultIncludes: 'UPDATE users',
      schemaIncludes: 'UPDATE crm.users',
    },
    {
      name: 'replaceOne',
      sql: (builder) =>
        builder.replaceOne<{ email: string; name: string }>(
          { email: 'a@test' },
          { email: 'b@test', name: 'B' },
        ),
      defaultIncludes: 'UPDATE users',
      schemaIncludes: 'UPDATE crm.users',
    },
    {
      name: 'updateMany',
      sql: (builder) =>
        builder.updateMany<{ email: string; name: string }>(
          { email: 'a@test' },
          { $set: { name: 'A' } },
        ),
      defaultIncludes: 'UPDATE users',
      schemaIncludes: 'UPDATE crm.users',
    },
    {
      name: 'deleteOne',
      sql: (builder) => builder.deleteOne({ email: 'a@test' }),
      defaultIncludes: 'DELETE FROM users',
      schemaIncludes: 'DELETE FROM crm.users',
    },
    {
      name: 'deleteMany',
      sql: (builder) => builder.deleteMany({ email: 'a@test' }),
      defaultIncludes: 'DELETE FROM users',
      schemaIncludes: 'DELETE FROM crm.users',
    },
    {
      name: 'replaceMany',
      sql: (builder) => builder.replaceMany([{ _id: '1', email: 'a@test' }]),
      defaultIncludes: 'UPDATE users',
      schemaIncludes: 'UPDATE crm.users',
    },
    {
      name: 'deleteManyByIds',
      sql: (builder) => builder.deleteManyByIds([{ _id: '1' }]),
      defaultIncludes: 'DELETE FROM users',
      schemaIncludes: 'DELETE FROM crm.users',
    },
    {
      name: 'findOne',
      sql: (builder) => builder.findOne({ email: 'a@test' }),
      defaultIncludes: 'FROM users',
      schemaIncludes: 'FROM crm.users',
    },
    {
      name: 'find',
      sql: (builder) => builder.find({}),
      defaultIncludes: 'FROM users',
      schemaIncludes: 'FROM crm.users',
    },
    {
      name: 'countDocuments',
      sql: (builder) => builder.countDocuments({}),
      defaultIncludes: 'FROM users',
      schemaIncludes: 'FROM crm.users',
    },
    {
      name: 'rename',
      sql: (builder) => builder.rename('archived_users'),
      defaultIncludes: 'ALTER TABLE users RENAME TO archived_users',
      schemaIncludes: 'ALTER TABLE crm.users RENAME TO archived_users',
    },
    {
      name: 'drop',
      sql: (builder) => builder.drop(),
      defaultIncludes: 'DROP TABLE IF EXISTS users',
      schemaIncludes: 'DROP TABLE IF EXISTS crm.users',
    },
  ];

  for (const testCase of runtimeSQLCases) {
    it(`uses default and explicit PostgreSQL schemas in ${testCase.name}`, () => {
      const defaultBuilder = postgresSQLBuilder(
        pongoSchema.collection('users'),
        JSONSerializer,
      );
      const schemaBuilder = postgresSQLBuilder(
        pongoSchema.collection('users', { schema: 'crm' }),
        JSONSerializer,
      );
      const defaultSQL = singleLine(
        SQL.format(testCase.sql(defaultBuilder), pgFormatter).query,
      );
      const schemaSQL = singleLine(
        SQL.format(testCase.sql(schemaBuilder), pgFormatter).query,
      );

      assert.ok(
        defaultSQL.includes(testCase.defaultIncludes),
        `${testCase.name} default got: ${defaultSQL}`,
      );
      assert.ok(
        !defaultSQL.includes('crm.users'),
        `${testCase.name} default should not use crm.users: ${defaultSQL}`,
      );
      assert.ok(
        schemaSQL.includes(testCase.schemaIncludes),
        `${testCase.name} schema got: ${schemaSQL}`,
      );
    });
  }

  it('keeps declared JSON path indexes on the collection table', () => {
    const collection = pongoSchema.collection('users', {
      indexes: [
        pongoSchema.index('users_email_idx', 'email'),
        pongoSchema.index.unique('users_external_id_uq', ['external', 'id']),
      ],
    });
    const migrations = pongoCollectionPostgreSQLMigrations(collection);

    assert.strictEqual(migrations.length, 1);
    assert.strictEqual(
      collection.indexes.get('users_email_idx')?.name,
      'users_email_idx',
    );
    assert.strictEqual(
      collection.indexes.get('users_external_id_uq')?.unique,
      true,
    );
  });

  it('keeps declared document JSON indexes on the collection table', () => {
    const collection = pongoSchema.collection('users', {
      indexes: [pongoSchema.index.json('users_data_idx')],
    });
    const migrations = pongoCollectionPostgreSQLMigrations(collection);

    assert.strictEqual(migrations.length, 1);
    assert.strictEqual(
      collection.indexes.get('users_data_idx')?.type,
      'json_document',
    );
  });

  it('keeps declared indexes on explicit PostgreSQL schema tables', () => {
    const collection = pongoSchema.collection('users', {
      schema: 'crm',
      indexes: [pongoSchema.index('users_email_idx', 'email')],
    });
    const migrations = pongoCollectionPostgreSQLMigrations(collection);

    assert.strictEqual(migrations.length, 1);
    assert.strictEqual(collection.databaseSchemaName, 'crm');
    assert.strictEqual(
      collection.indexes.get('users_email_idx')?.path,
      'email',
    );
  });

  it('keeps custom index SQL hooks on the collection table', () => {
    const collection = pongoSchema.collection('users', {
      schema: 'crm',
      indexes: [
        {
          name: 'users_custom_data_idx',
          type: 'custom_jsonb_path',
          sql: ({ tableReference }) =>
            SQL`CREATE INDEX IF NOT EXISTS users_custom_data_idx ON ${tableReference} USING GIN (data jsonb_path_ops)`,
        },
      ],
    });
    const migrations = pongoCollectionPostgreSQLMigrations(collection);

    assert.strictEqual(migrations.length, 1);
    assert.strictEqual(
      typeof collection.indexes.get('users_custom_data_idx')?.sql,
      'function',
    );
  });
});

describe('insertOrReplace()', () => {
  const builder = postgresSQLBuilder('users', JSONSerializer);

  it('inserts at version 1 and bumps on conflict in a single statement', () => {
    const query = builder.insertOrReplace([{ _id: 'u1', name: 'Alice' }]);
    const { query: sql } = SQL.format(query, pgFormatter);

    assert.ok(sql.includes('INSERT INTO'), `got: ${sql}`);
    assert.ok(sql.includes('(_id, data, _version)'), `got: ${sql}`);
    assert.ok(sql.includes('ON CONFLICT(_id) DO UPDATE SET'), `got: ${sql}`);
    assert.ok(sql.includes('EXCLUDED.data'), `got: ${sql}`);
    assert.ok(sql.includes('users._version + 1'), `got: ${sql}`);
    assert.ok(
      sql.includes('RETURNING _id, _version AS version'),
      `got: ${sql}`,
    );
    // No writable CTE, no DO NOTHING.
    assert.ok(!sql.includes('DO NOTHING'), `got: ${sql}`);
  });

  it('emits one VALUES row per document', () => {
    const query = builder.insertOrReplace([
      { _id: 'a', name: 'A' },
      { _id: 'b', name: 'B' },
    ]);
    const { params } = SQL.format(query, pgFormatter);
    assert.ok(params.includes('a'));
    assert.ok(params.includes('b'));
  });
});

describe('find() query options', () => {
  it('should apply limit correctly', () => {
    const query = postgresSQLBuilder('users', JSONSerializer).find(
      {},
      { limit: 4 },
    );
    assert.deepStrictEqual(SQL.format(query, pgFormatter), {
      query: 'SELECT data, _id, _version FROM users LIMIT $1 ;',
      params: [4],
    });
  });

  it('should apply offset correctly', () => {
    const query = postgresSQLBuilder('users', JSONSerializer).find(
      {},
      { skip: 123 },
    );
    assert.deepStrictEqual(SQL.format(query, pgFormatter), {
      query: 'SELECT data, _id, _version FROM users OFFSET $1 ;',
      params: [123],
    });
  });

  it('should apply limit and offset in correct order', () => {
    const query = postgresSQLBuilder('users', JSONSerializer).find(
      {},
      { limit: 20, skip: 123 },
    );
    assert.deepStrictEqual(SQL.format(query, pgFormatter), {
      query: 'SELECT data, _id, _version FROM users LIMIT $1 OFFSET $2 ;',
      params: [20, 123],
    });
  });
});

describe('find() sort option', () => {
  const builder = postgresSQLBuilder('users', JSONSerializer);

  it('sorts ASC by a single field', () => {
    const query = builder.find({}, { sort: { name: 1 } });
    const { query: sql } = SQL.format(query, pgFormatter);
    assert.ok(sql.includes(`ORDER BY data -> 'name' ASC`), `got: ${sql}`);
  });

  it('sorts DESC by a single field', () => {
    const query = builder.find({}, { sort: { created_at: -1 } });
    const { query: sql } = SQL.format(query, pgFormatter);
    assert.ok(
      sql.includes(`ORDER BY data -> 'created_at' DESC`),
      `got: ${sql}`,
    );
  });

  it('ORDER BY appears before LIMIT', () => {
    const query = builder.find({}, { sort: { name: 1 }, limit: 10 });
    const { query: sql } = SQL.format(query, pgFormatter);
    assert.ok(sql.indexOf('ORDER BY') < sql.indexOf('LIMIT'), `got: ${sql}`);
  });

  it('sort + limit + skip produces correct clause order', () => {
    const query = builder.find({}, { sort: { name: 1 }, limit: 10, skip: 5 });
    const { query: sql, params } = SQL.format(query, pgFormatter);
    assert.ok(/ORDER BY.*LIMIT.*OFFSET/s.test(sql), `got: ${sql}`);
    assert.deepStrictEqual(params, [10, 5]);
  });

  it('empty sort object produces no ORDER BY clause', () => {
    const query = builder.find({}, { sort: {} });
    const { query: sql } = SQL.format(query, pgFormatter);
    assert.ok(!sql.includes('ORDER BY'), `got: ${sql}`);
  });

  it('sorts by multiple fields', () => {
    const query = builder.find({}, { sort: { age: -1, name: 1 } });
    const { query: sql } = SQL.format(query, pgFormatter);
    assert.ok(
      sql.includes(
        `ORDER BY data -> 'age' DESC NULLS LAST,data -> 'name' ASC NULLS FIRST`,
      ),
      `got: ${sql}`,
    );
  });

  it('sorts by a nested field', () => {
    const query = builder.find({}, { sort: { 'address.city': 1 } });
    const { query: sql } = SQL.format(query, pgFormatter);
    assert.ok(
      sql.includes(`ORDER BY data #> '{address,city}' ASC`),
      `got: ${sql}`,
    );
  });

  it('sorts by a deeply nested field (3 levels)', () => {
    const query = builder.find({}, { sort: { 'a.b.c': -1 } });
    const { query: sql } = SQL.format(query, pgFormatter);
    assert.ok(sql.includes(`ORDER BY data #> '{a,b,c}' DESC`), `got: ${sql}`);
  });

  it('places documents with missing field first on ASC sort (NULLS FIRST)', () => {
    const query = builder.find({}, { sort: { age: 1 } });
    const { query: sql } = SQL.format(query, pgFormatter);
    assert.ok(sql.includes(`ASC NULLS FIRST`), `got: ${sql}`);
  });

  it('places documents with missing field last on DESC sort (NULLS LAST)', () => {
    const query = builder.find({}, { sort: { age: -1 } });
    const { query: sql } = SQL.format(query, pgFormatter);
    assert.ok(sql.includes(`DESC NULLS LAST`), `got: ${sql}`);
  });

  it('sorts by _id using the native column, not the JSON field', () => {
    const query = builder.find({}, { sort: { _id: 1 } });
    const { query: sql } = SQL.format(query, pgFormatter);
    assert.ok(sql.includes('ORDER BY _id ASC'), `got: ${sql}`);
    assert.ok(!sql.includes('data ->'), `got: ${sql}`);
  });

  it('sorts by _version using the native column, not the JSON field', () => {
    const query = builder.find({}, { sort: { _version: -1 } });
    const { query: sql } = SQL.format(query, pgFormatter);
    assert.ok(sql.includes('ORDER BY _version DESC'), `got: ${sql}`);
    assert.ok(!sql.includes('data ->'), `got: ${sql}`);
  });
});

describe('expected version markers', () => {
  const builder = postgresSQLBuilder('users', JSONSerializer);

  const queryFor = (
    expectedVersion: Exclude<
      ExpectedDocumentVersion,
      'DOCUMENT_DOES_NOT_EXIST'
    >,
  ) =>
    SQL.format(
      builder.deleteOne({ _id: 'test-id' }, { expectedVersion }),
      pgFormatter,
    ).query;

  it('adds no version check for DOCUMENT_EXISTS (existence enforced by the row match)', () => {
    assert.equal(queryFor('DOCUMENT_EXISTS'), queryFor('NO_CONCURRENCY_CHECK'));
  });

  it('adds no version check for NO_CONCURRENCY_CHECK', () => {
    assert.ok(!queryFor('NO_CONCURRENCY_CHECK').includes('_version'));
  });

  it('adds a _version check for a concrete expected version', () => {
    const pinned = queryFor(2n);
    assert.ok(pinned.includes('_version'), `got: ${pinned}`);
    assert.notEqual(pinned, queryFor('NO_CONCURRENCY_CHECK'));
  });
});

describe('find() logical operators', () => {
  const builder = postgresSQLBuilder('users', JSONSerializer);

  it('supports top-level $or', () => {
    const query = builder.find<{ flag: boolean }>({
      $or: [{ flag: true }, { flag: false }],
    });
    const { query: sql } = SQL.format(query, pgFormatter);

    assert.ok(sql.includes(' OR '), `got: ${sql}`);
    assert.ok(!sql.includes('$.$or'), `got: ${sql}`);
    assert.ok(!sql.includes('1 = 0'), `got: ${sql}`);
    assert.ok(!sql.includes('1 = 1'), `got: ${sql}`);
  });

  it('ANDs normal fields with $or blocks', () => {
    const query = builder.find<{ flag: boolean; status: string }>({
      status: 'active',
      $or: [{ flag: true }, { flag: false }],
    });
    const { query: sql } = SQL.format(query, pgFormatter);

    assert.ok(sql.includes(' AND '), `got: ${sql}`);
    assert.ok(sql.includes(' OR '), `got: ${sql}`);
  });

  it('supports nested logical operators', () => {
    const query = builder.find<{ flag: boolean; status: string }>({
      $and: [{ status: 'active' }, { $or: [{ flag: true }, { flag: false }] }],
    });
    const { query: sql } = SQL.format(query, pgFormatter);

    assert.ok(sql.includes(' AND '), `got: ${sql}`);
    assert.ok(sql.includes(' OR '), `got: ${sql}`);
    assert.ok(!sql.includes('1 = 0'), `got: ${sql}`);
    assert.ok(!sql.includes('1 = 1'), `got: ${sql}`);
  });

  it('throws for unsupported root operators instead of treating them as fields', () => {
    const unsupportedFilter = {
      $text: { $search: 'active' },
    } as unknown as Parameters<typeof builder.find>[0];

    assert.throws(
      () => builder.find(unsupportedFilter),
      /Unsupported root operator: \$text/,
    );
  });
});
