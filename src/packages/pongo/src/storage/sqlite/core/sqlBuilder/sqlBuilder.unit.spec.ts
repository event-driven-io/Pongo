import { JSONSerializer, SQL } from '@event-driven-io/dumbo';
import { sqliteFormatter } from '@event-driven-io/dumbo/sqlite';
import { randomUUID } from 'crypto';
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  pongoSchema,
  type ExpectedDocumentVersion,
  type PongoCollectionSQLBuilder,
} from '../../../../core';
import { pongoCollectionSQLiteMigrations, sqliteSQLBuilder } from './index';

describe('sqliteSQLBuilder', () => {
  const collectionName = 'testCollection';
  const builder = sqliteSQLBuilder(collectionName, JSONSerializer);
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

  describe('createCollection', () => {
    it('should generate correct CREATE TABLE statement', () => {
      const result = builder.createCollection();
      const { query } = SQL.format(result, sqliteFormatter);

      const expected = `
    CREATE TABLE IF NOT EXISTS "${collectionName}" (
      _id           TEXT           PRIMARY KEY,
      data          JSON           NOT NULL,
      metadata      JSON           NOT NULL     DEFAULT '{}',
      _version      INTEGER        NOT NULL     DEFAULT 1,
      _partition    TEXT           NOT NULL     DEFAULT 'png_global',
      _archived     INTEGER        NOT NULL     DEFAULT 0,
      _created      TEXT           NOT NULL     DEFAULT (datetime('now')),
      _updated      TEXT           NOT NULL     DEFAULT (datetime('now'))
  )`;

      assert.equal(query, expected);
    });
  });

  describe('schema migrations', () => {
    const singleLine = (value: string) => value.replace(/\s+/g, ' ').trim();

    it('keeps default schema migrations unprefixed', () => {
      const migrations = pongoCollectionSQLiteMigrations(
        pongoSchema.collection('users'),
      );
      const { query } = SQL.format(migrations[0]!.sqls[0]!, sqliteFormatter);

      assert.equal(
        migrations[0]!.name,
        'pongoCollection:users:001:createtable',
      );
      assert.ok(query.includes('CREATE TABLE IF NOT EXISTS users'));
    });

    it('prefixes explicit schema migrations and runtime SQL', () => {
      const schema = pongoSchema.collection('users', { schema: 'crm' });
      const migrations = pongoCollectionSQLiteMigrations(schema);
      const { query } = SQL.format(migrations[0]!.sqls[0]!, sqliteFormatter);
      const builder = sqliteSQLBuilder(schema, JSONSerializer);
      const insert = SQL.format(
        builder.insertOne({ _id: '1', name: 'Oskar' }),
        sqliteFormatter,
      );

      assert.equal(
        migrations[0]!.name,
        'pongoCollection:crm:users:001:createtable',
      );
      assert.ok(query.includes('CREATE TABLE IF NOT EXISTS crm_users'));
      assert.ok(insert.query.includes('INSERT OR IGNORE INTO crm_users'));
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
        schemaIncludes: 'CREATE TABLE IF NOT EXISTS crm_users',
      },
      {
        name: 'insertOne',
        sql: (builder) => builder.insertOne({ _id: '1', email: 'a@test' }),
        defaultIncludes: 'INSERT OR IGNORE INTO users',
        schemaIncludes: 'INSERT OR IGNORE INTO crm_users',
      },
      {
        name: 'insertMany',
        sql: (builder) => builder.insertMany([{ _id: '1', email: 'a@test' }]),
        defaultIncludes: 'INSERT OR IGNORE INTO users',
        schemaIncludes: 'INSERT OR IGNORE INTO crm_users',
      },
      {
        name: 'insertOrReplace',
        sql: (builder) =>
          builder.insertOrReplace([{ _id: '1', email: 'a@test' }]),
        defaultIncludes: 'INSERT INTO users',
        schemaIncludes: 'INSERT INTO crm_users',
      },
      {
        name: 'updateOne',
        sql: (builder) =>
          builder.updateOne<{ email: string; name: string }>(
            { email: 'a@test' },
            { $set: { name: 'A' } },
          ),
        defaultIncludes: 'UPDATE users',
        schemaIncludes: 'UPDATE crm_users',
      },
      {
        name: 'replaceOne',
        sql: (builder) =>
          builder.replaceOne<{ email: string; name: string }>(
            { email: 'a@test' },
            { email: 'b@test', name: 'B' },
          ),
        defaultIncludes: 'UPDATE users',
        schemaIncludes: 'UPDATE crm_users',
      },
      {
        name: 'updateMany',
        sql: (builder) =>
          builder.updateMany<{ email: string; name: string }>(
            { email: 'a@test' },
            { $set: { name: 'A' } },
          ),
        defaultIncludes: 'UPDATE users',
        schemaIncludes: 'UPDATE crm_users',
      },
      {
        name: 'deleteOne',
        sql: (builder) => builder.deleteOne({ email: 'a@test' }),
        defaultIncludes: 'DELETE FROM users',
        schemaIncludes: 'DELETE FROM crm_users',
      },
      {
        name: 'deleteMany',
        sql: (builder) => builder.deleteMany({ email: 'a@test' }),
        defaultIncludes: 'DELETE FROM users',
        schemaIncludes: 'DELETE FROM crm_users',
      },
      {
        name: 'replaceMany',
        sql: (builder) => builder.replaceMany([{ _id: '1', email: 'a@test' }]),
        defaultIncludes: 'UPDATE users',
        schemaIncludes: 'UPDATE crm_users',
      },
      {
        name: 'deleteManyByIds',
        sql: (builder) => builder.deleteManyByIds([{ _id: '1' }]),
        defaultIncludes: 'DELETE FROM users',
        schemaIncludes: 'DELETE FROM crm_users',
      },
      {
        name: 'findOne',
        sql: (builder) => builder.findOne({ email: 'a@test' }),
        defaultIncludes: 'FROM users',
        schemaIncludes: 'FROM crm_users',
      },
      {
        name: 'find',
        sql: (builder) => builder.find({}),
        defaultIncludes: 'FROM users',
        schemaIncludes: 'FROM crm_users',
      },
      {
        name: 'countDocuments',
        sql: (builder) => builder.countDocuments({}),
        defaultIncludes: 'FROM users',
        schemaIncludes: 'FROM crm_users',
      },
      {
        name: 'rename',
        sql: (builder) => builder.rename('archived_users'),
        defaultIncludes: 'ALTER TABLE users RENAME TO archived_users',
        schemaIncludes: 'ALTER TABLE crm_users RENAME TO archived_users',
      },
      {
        name: 'drop',
        sql: (builder) => builder.drop(),
        defaultIncludes: 'DROP TABLE IF EXISTS users',
        schemaIncludes: 'DROP TABLE IF EXISTS crm_users',
      },
    ];

    for (const testCase of runtimeSQLCases) {
      it(`uses default and prefixed schema tables in ${testCase.name}`, () => {
        const defaultBuilder = sqliteSQLBuilder(
          pongoSchema.collection('users'),
          JSONSerializer,
        );
        const schemaBuilder = sqliteSQLBuilder(
          pongoSchema.collection('users', { schema: 'crm' }),
          JSONSerializer,
        );
        const defaultSQL = singleLine(
          SQL.format(testCase.sql(defaultBuilder), sqliteFormatter).query,
        );
        const schemaSQL = singleLine(
          SQL.format(testCase.sql(schemaBuilder), sqliteFormatter).query,
        );

        assert.ok(
          defaultSQL.includes(testCase.defaultIncludes),
          `${testCase.name} default got: ${defaultSQL}`,
        );
        assert.ok(
          !defaultSQL.includes('crm_users'),
          `${testCase.name} default should not use crm_users: ${defaultSQL}`,
        );
        assert.ok(
          schemaSQL.includes(testCase.schemaIncludes),
          `${testCase.name} schema got: ${schemaSQL}`,
        );
      });
    }

    it('creates named JSON path index migrations', () => {
      const migrations = pongoCollectionSQLiteMigrations(
        pongoSchema.collection('users', {
          indexes: [
            pongoSchema.index('users_email_idx', 'email'),
            pongoSchema.index.unique('users_external_id_uq', [
              'external',
              'id',
            ]),
          ],
        }),
      );
      const index = SQL.format(migrations[1]!.sqls[0]!, sqliteFormatter);
      const unique = SQL.format(migrations[2]!.sqls[0]!, sqliteFormatter);

      assert.equal(
        migrations[1]!.name,
        'pongoCollection:users:002:index:users_email_idx',
      );
      assert.ok(
        singleLine(index.query).includes(
          "CREATE INDEX IF NOT EXISTS users_email_idx ON users (json_extract(data, '$.email'))",
        ),
        `got: ${index.query}`,
      );
      assert.ok(
        singleLine(unique.query).includes(
          "CREATE UNIQUE INDEX IF NOT EXISTS users_external_id_uq ON users (json_extract(data, '$.external.id'))",
        ),
        `got: ${unique.query}`,
      );
    });

    it('creates named indexes on prefixed schema tables', () => {
      const migrations = pongoCollectionSQLiteMigrations(
        pongoSchema.collection('users', {
          schema: 'crm',
          indexes: [pongoSchema.index('users_email_idx', 'email')],
        }),
      );
      const index = SQL.format(migrations[1]!.sqls[0]!, sqliteFormatter);

      assert.equal(
        migrations[1]!.name,
        'pongoCollection:crm:users:002:index:users_email_idx',
      );
      assert.ok(
        singleLine(index.query).includes(
          "CREATE INDEX IF NOT EXISTS users_email_idx ON crm_users (json_extract(data, '$.email'))",
        ),
        `got: ${index.query}`,
      );
    });

    it('creates document JSON index migrations on data', () => {
      const migrations = pongoCollectionSQLiteMigrations(
        pongoSchema.collection('users', {
          indexes: [
            pongoSchema.index('users_email_idx', 'email'),
            pongoSchema.index.json('users_data_idx'),
          ],
        }),
      );
      const index = SQL.format(migrations[2]!.sqls[0]!, sqliteFormatter);

      assert.deepStrictEqual(
        migrations.map((migration) => migration.name),
        [
          'pongoCollection:users:001:createtable',
          'pongoCollection:users:002:index:users_email_idx',
          'pongoCollection:users:002:index:users_data_idx',
        ],
      );
      assert.ok(
        singleLine(index.query).includes(
          'CREATE INDEX IF NOT EXISTS users_data_idx ON users (data)',
        ),
        `got: ${index.query}`,
      );
    });

    it('creates custom index migrations with schema-aware SQL context', () => {
      const migrations = pongoCollectionSQLiteMigrations(
        pongoSchema.collection('users', {
          schema: 'crm',
          indexes: [
            {
              name: 'users_custom_data_idx',
              type: 'custom_json_index',
              sql: ({ tableReference, databaseSchemaName, tableName }) => {
                assert.strictEqual(databaseSchemaName, 'crm');
                assert.strictEqual(tableName, 'crm_users');
                return SQL`CREATE INDEX IF NOT EXISTS users_custom_data_idx ON ${tableReference} (data)`;
              },
            },
          ],
        }),
      );
      const index = SQL.format(migrations[1]!.sqls[0]!, sqliteFormatter);

      assert.equal(
        migrations[1]!.name,
        'pongoCollection:crm:users:002:index:users_custom_data_idx',
      );
      assert.ok(
        singleLine(index.query).includes(
          'CREATE INDEX IF NOT EXISTS users_custom_data_idx ON crm_users (data)',
        ),
        `got: ${index.query}`,
      );
    });
  });

  describe('insertOne', () => {
    it('should generate correct INSERT statement', () => {
      const document = { _id: randomUUID(), name: 'Test', age: 30 };
      const result = builder.insertOne(document);
      const { query } = SQL.format(result, sqliteFormatter);

      assert.ok(query.includes('INSERT OR IGNORE INTO'));
      assert.ok(query.includes('(_id, data, _version)'));
    });

    it('binds serialized document JSON without SQL-escaping string content', () => {
      const result = builder.insertOne(specialDocument);
      const { params } = SQL.format(result, sqliteFormatter);

      assert.deepStrictEqual(params, [
        specialDocument._id,
        specialDocumentJSON,
        '1',
      ]);
    });
  });

  describe('bound JSON params', () => {
    it('insertMany binds serialized JSON without SQL escaping', () => {
      const result = builder.insertMany([specialDocument]);
      const { params } = SQL.format(result, sqliteFormatter);

      assert.deepStrictEqual(params, [
        specialDocument._id,
        specialDocumentJSON,
        '1',
      ]);
    });

    it('insertOrReplace binds serialized JSON without SQL escaping', () => {
      const result = builder.insertOrReplace([specialDocument]);
      const { params } = SQL.format(result, sqliteFormatter);

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
      const { params } = SQL.format(result, sqliteFormatter);

      assert.deepStrictEqual(params, [
        JSONSerializer.serialize(patch),
        specialDocument._id,
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
      const { params } = SQL.format(result, sqliteFormatter);

      assert.deepStrictEqual(params, [
        JSONSerializer.serialize(patch),
        specialDocument.title,
        specialDocument.title,
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
      const { params } = SQL.format(result, sqliteFormatter);

      assert.deepStrictEqual(params, [
        JSONSerializer.serialize(replacement),
        specialDocument._id,
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
      const { params } = SQL.format(result, sqliteFormatter);

      assert.deepStrictEqual(params, [
        specialDocument._id,
        specialDocumentJSON,
        secondDocument._id,
        JSONSerializer.serialize(secondDocument),
        '7',
      ]);
    });
  });

  describe('insertOrReplace', () => {
    it('inserts at version 1 and bumps on conflict in a single statement', () => {
      const result = builder.insertOrReplace([
        { _id: randomUUID(), name: 'Test', age: 30 },
      ]);
      const { query } = SQL.format(result, sqliteFormatter);

      assert.ok(query.includes('INSERT INTO'));
      assert.ok(query.includes('(_id, data, _version)'));
      assert.ok(query.includes('ON CONFLICT(_id) DO UPDATE SET'));
      assert.ok(query.includes('json_patch(excluded.data'));
      assert.ok(query.includes(`"${collectionName}"._version + 1`));
      assert.ok(
        query.includes('RETURNING _id, cast(_version as TEXT) as version'),
      );
      // No writable CTE and no DO NOTHING.
      assert.ok(!query.includes('DO NOTHING'));
    });

    it('emits one VALUES row per document', () => {
      const result = builder.insertOrReplace([
        { _id: 'a', name: 'A' },
        { _id: 'b', name: 'B' },
      ]);
      const { params } = SQL.format(result, sqliteFormatter);
      // two ids + two serialized docs
      assert.ok(params.includes('a'));
      assert.ok(params.includes('b'));
    });
  });

  describe('find operations', () => {
    it('should handle empty filter', () => {
      const result = builder.find({});
      const { query } = SQL.format(result, sqliteFormatter);

      assert.ok(query.includes('SELECT data, _id, _version FROM'));
      assert.ok(!query.includes('WHERE'));
    });

    it('should handle simple equality filter', () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
      const result = builder.find({ name: 'John' } as any);
      const { query } = SQL.format(result, sqliteFormatter);

      assert.ok(query.includes('WHERE'));
      assert.ok(query.includes('json_extract'));
    });

    it('binds string filter values without SQL escaping', () => {
      const result = builder.find({
        title: specialDocument.title,
      });
      const { params } = SQL.format(result, sqliteFormatter);

      assert.deepStrictEqual(params, [
        specialDocument.title,
        specialDocument.title,
      ]);
    });

    it('binds nested object equality values without SQL escaping', () => {
      const result = builder.find({
        nested: { quote: specialDocument.nested.quote },
      });
      const { params } = SQL.format(result, sqliteFormatter);

      assert.deepStrictEqual(params, [
        specialDocument.nested.quote,
        specialDocument.nested.quote,
      ]);
    });

    it('should handle limit and skip options', () => {
      const result = builder.find({}, { limit: 10, skip: 5 });
      const { query } = SQL.format(result, sqliteFormatter);

      assert.ok(query.includes('LIMIT'));
      assert.ok(query.includes('OFFSET'));
    });

    it('empty sort object produces no ORDER BY clause', () => {
      const result = builder.find({}, { sort: {} });
      const { query } = SQL.format(result, sqliteFormatter);
      assert.ok(!query.includes('ORDER BY'), `got: ${query}`);
    });

    it('sorts ASC by a single field', () => {
      const result = builder.find({}, { sort: { name: 1 } });
      const { query } = SQL.format(result, sqliteFormatter);
      assert.ok(
        query.includes(`ORDER BY json_extract(data, '$.name') ASC`),
        `got: ${query}`,
      );
    });

    it('sorts DESC by a single field', () => {
      const result = builder.find({}, { sort: { created_at: -1 } });
      const { query } = SQL.format(result, sqliteFormatter);
      assert.ok(
        query.includes(`ORDER BY json_extract(data, '$.created_at') DESC`),
        `got: ${query}`,
      );
    });

    it('ORDER BY appears before LIMIT', () => {
      const result = builder.find({}, { sort: { name: 1 }, limit: 10 });
      const { query } = SQL.format(result, sqliteFormatter);
      assert.ok(
        query.indexOf('ORDER BY') < query.indexOf('LIMIT'),
        `got: ${query}`,
      );
    });

    it('sort + limit + skip produces correct clause order', () => {
      const result = builder.find(
        {},
        { sort: { name: 1 }, limit: 10, skip: 5 },
      );
      const { query } = SQL.format(result, sqliteFormatter);
      assert.ok(/ORDER BY.*LIMIT.*OFFSET/s.test(query), `got: ${query}`);
    });

    it('sorts by multiple fields', () => {
      const result = builder.find({}, { sort: { age: -1, name: 1 } });
      const { query } = SQL.format(result, sqliteFormatter);
      assert.ok(
        query.includes(
          `ORDER BY json_extract(data, '$.age') DESC,json_extract(data, '$.name') ASC`,
        ),
        `got: ${query}`,
      );
    });

    it('sorts by a nested field', () => {
      const result = builder.find({}, { sort: { 'address.city': 1 } });
      const { query } = SQL.format(result, sqliteFormatter);
      assert.ok(
        query.includes(`ORDER BY json_extract(data, '$.address.city') ASC`),
        `got: ${query}`,
      );
    });

    it('sorts by a deeply nested field (3 levels)', () => {
      const result = builder.find({}, { sort: { 'a.b.c': -1 } });
      const { query } = SQL.format(result, sqliteFormatter);
      assert.ok(
        query.includes(`ORDER BY json_extract(data, '$.a.b.c') DESC`),
        `got: ${query}`,
      );
    });

    it('sorts by _id using the native column, not the JSON field', () => {
      const result = builder.find({}, { sort: { _id: 1 } });
      const { query } = SQL.format(result, sqliteFormatter);
      assert.ok(query.includes('ORDER BY _id ASC'), `got: ${query}`);
      assert.ok(!query.includes('json_extract'), `got: ${query}`);
    });

    it('sorts by _version using the native column, not the JSON field', () => {
      const result = builder.find({}, { sort: { _version: -1 } });
      const { query } = SQL.format(result, sqliteFormatter);
      assert.ok(query.includes('ORDER BY _version DESC'), `got: ${query}`);
      assert.ok(!query.includes('json_extract'), `got: ${query}`);
    });
  });

  describe('update operations', () => {
    it('should handle $set operator', () => {
      const result = builder.updateOne<{ name: string }>(
        { _id: 'test-id' },
        { $set: { name: 'Updated' } },
      );
      const { query } = SQL.format(result, sqliteFormatter);

      assert.ok(query.includes('UPDATE'));
      assert.ok(query.includes('json_patch') || query.includes('json_set'));
    });

    it('should handle $inc operator', () => {
      const result = builder.updateOne<{ count: number }>(
        { _id: 'test-id' },
        { $inc: { count: 1 } },
      );
      const { query } = SQL.format(result, sqliteFormatter);

      assert.ok(query.includes('json_set'));
      assert.ok(query.includes('json_extract'));
    });

    it('should handle $push operator', () => {
      const result = builder.updateOne<{ tags: string }>(
        { _id: 'test-id' },
        { $push: { tags: 'new-tag' } },
      );
      const { query } = SQL.format(result, sqliteFormatter);

      assert.ok(query.includes('json_set'));
      assert.ok(query.includes('json_type') || query.includes('json_array'));
    });
  });

  describe('delete operations', () => {
    it('should generate correct DELETE statement', () => {
      const result = builder.deleteOne({ _id: 'test-id' });
      const { query } = SQL.format(result, sqliteFormatter);

      assert.ok(query.includes('DELETE FROM'));
      assert.ok(query.includes('WHERE'));
    });

    it('should handle expected version in deleteOne', () => {
      const result = builder.deleteOne(
        { _id: 'test-id' },
        { expectedVersion: 2n },
      );
      const { query } = SQL.format(result, sqliteFormatter);

      assert.ok(query.includes('_version'));
    });
  });

  describe('expected version markers', () => {
    const queryFor = (
      expectedVersion: Exclude<
        ExpectedDocumentVersion,
        'DOCUMENT_DOES_NOT_EXIST'
      >,
    ) =>
      SQL.format(
        builder.deleteOne({ _id: 'test-id' }, { expectedVersion }),
        sqliteFormatter,
      ).query;

    it('adds no version check for DOCUMENT_EXISTS (existence enforced by the row match)', () => {
      assert.equal(
        queryFor('DOCUMENT_EXISTS'),
        queryFor('NO_CONCURRENCY_CHECK'),
      );
    });

    it('adds no version check for NO_CONCURRENCY_CHECK', () => {
      assert.ok(!queryFor('NO_CONCURRENCY_CHECK').includes('AND _version'));
    });

    it('adds a _version check for a concrete expected version', () => {
      const pinned = queryFor(2n);
      assert.ok(pinned.includes('AND _version'), `got: ${pinned}`);
      assert.notEqual(pinned, queryFor('NO_CONCURRENCY_CHECK'));
    });
  });

  describe('countDocuments', () => {
    it('should generate correct COUNT statement', () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
      const result = builder.countDocuments({ status: 'active' } as any);
      const { query } = SQL.format(result, sqliteFormatter);

      assert.ok(query.includes('SELECT COUNT(1) as count'));
      assert.ok(query.includes('WHERE'));
    });
  });

  describe('logical operators', () => {
    it('supports top-level $or', () => {
      const result = builder.find<{ flag: boolean }>({
        $or: [{ flag: true }, { flag: false }],
      });
      const { query } = SQL.format(result, sqliteFormatter);

      assert.ok(query.includes(' OR '), `got: ${query}`);
      assert.ok(!query.includes('$.$or'), `got: ${query}`);
      assert.ok(!query.includes('1 = 0'), `got: ${query}`);
      assert.ok(!query.includes('1 = 1'), `got: ${query}`);
    });

    it('ANDs normal fields with $or blocks', () => {
      const result = builder.find<{ flag: boolean; status: string }>({
        status: 'active',
        $or: [{ flag: true }, { flag: false }],
      });
      const { query } = SQL.format(result, sqliteFormatter);

      assert.ok(query.includes(' AND '), `got: ${query}`);
      assert.ok(query.includes(' OR '), `got: ${query}`);
    });

    it('supports nested logical operators', () => {
      const result = builder.find<{ flag: boolean; status: string }>({
        $and: [
          { status: 'active' },
          { $or: [{ flag: true }, { flag: false }] },
        ],
      });
      const { query } = SQL.format(result, sqliteFormatter);

      assert.ok(query.includes(' AND '), `got: ${query}`);
      assert.ok(query.includes(' OR '), `got: ${query}`);
      assert.ok(!query.includes('1 = 0'), `got: ${query}`);
      assert.ok(!query.includes('1 = 1'), `got: ${query}`);
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
});
