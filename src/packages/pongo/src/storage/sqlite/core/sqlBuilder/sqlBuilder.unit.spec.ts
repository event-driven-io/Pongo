import {
  databaseMigrations,
  JSONSerializer,
  SQL,
  type TableIdentifier,
} from '@event-driven-io/dumbo';
import {
  sqliteFormatter,
  sqliteTableReference,
} from '@event-driven-io/dumbo/sqlite';
import { randomUUID } from 'crypto';
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  composePongoDatabase,
  pongoSchema,
  type ExpectedDocumentVersion,
  type PongoCollectionComponent,
  type PongoCollectionIndexes,
  type PongoCollectionSQLBuilder,
} from '../../../../core';
import { pongoSQLiteMigrationBuilder } from '../databaseMigrations';
import { sqliteSQLBuilder } from './index';

const formatSQL = (sql: SQL, formatter = sqliteFormatter) =>
  formatter.format(sql, { serializer: JSONSerializer });

const tableContext = (
  databaseSchemaName: string,
  tableName: string,
): TableIdentifier => ({
  databaseSchemaName,
  tableName,
});

const collectionInSchema = (schemaName: string, collectionName: string) =>
  collectionInSchemaWithIndexes(schemaName, collectionName, { indexes: {} });

const collectionInSchemaWithIndexes = <
  const Indexes extends PongoCollectionIndexes,
>(
  schemaName: string,
  collectionName: string,
  options: { indexes: Indexes },
) => ({
  collection: databaseInSchemaWithIndexes(schemaName, collectionName, options)
    .collection,
  identifier: tableContext(schemaName, collectionName),
});

const databaseInSchemaWithIndexes = <
  const Indexes extends PongoCollectionIndexes,
>(
  schemaName: string,
  collectionName: string,
  options: { indexes: Indexes },
) => {
  const collection = pongoSchema.collection(collectionName, { ...options });

  return {
    collection,
    database: composePongoDatabase({
      databaseName: 'app',
      defaultSchemaName: 'main',
      definition: pongoSchema.db({
        schemas: {
          [schemaName]: pongoSchema.schema(schemaName, { collection }),
        },
      }),
    }),
  };
};

const builderFor = (
  fixture: Readonly<{
    collection: PongoCollectionComponent;
    identifier: TableIdentifier;
  }>,
): PongoCollectionSQLBuilder =>
  sqliteSQLBuilder(
    fixture.collection,
    sqliteTableReference(fixture.identifier),
    (tableName) => sqliteTableReference({ ...fixture.identifier, tableName }),
    JSONSerializer,
  );

const migrationsFor = (
  database: ReturnType<typeof databaseInSchemaWithIndexes>['database'],
) => databaseMigrations(database, pongoSQLiteMigrationBuilder);

describe('sqliteSQLBuilder', () => {
  const collectionName = 'testCollection';
  const builder = builderFor(collectionInSchema('main', collectionName));
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
    it('creates a collection from its Dumbo columns', () => {
      const result = builder.createCollection();
      const { query } = formatSQL(result, sqliteFormatter);

      assert.strictEqual(
        query,
        `CREATE TABLE IF NOT EXISTS "${collectionName}" (_id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL, metadata TEXT NOT NULL DEFAULT '{}', _version INTEGER NOT NULL DEFAULT 1, _partition TEXT NOT NULL DEFAULT 'png_global', _archived INTEGER NOT NULL DEFAULT FALSE, _created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, _updated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      );
    });
  });

  describe('schema migrations', () => {
    const singleLine = (value: string) => value.replace(/\s+/g, ' ').trim();

    it('keeps default schema migrations unprefixed', () => {
      const migrations = migrationsFor(
        databaseInSchemaWithIndexes('main', 'users', {
          indexes: {},
        }).database,
      );
      const { query } = formatSQL(migrations[0]!.sqls[0]!, sqliteFormatter);

      assert.equal(
        migrations[0]!.name,
        'pongoCollection:users:001:createtable',
      );
      assert.ok(query.includes('CREATE TABLE IF NOT EXISTS users'));
    });

    it('keeps concrete main schema migrations unprefixed', () => {
      const collection = collectionInSchema('main', 'users');
      const migrations = migrationsFor(
        databaseInSchemaWithIndexes('main', 'users', {
          indexes: {},
        }).database,
      );
      const { query } = formatSQL(migrations[0]!.sqls[0]!, sqliteFormatter);
      const builder = builderFor(collection);
      const insert = formatSQL(
        builder.insertOne({ _id: '1', name: 'Oskar' }),
        sqliteFormatter,
      );

      assert.equal(
        migrations[0]!.name,
        'pongoCollection:users:001:createtable',
      );
      assert.ok(query.includes('CREATE TABLE IF NOT EXISTS users'));
      assert.ok(insert.query.includes('INSERT OR IGNORE INTO users'));
      assert.ok(!query.includes('main_users'));
      assert.ok(!insert.query.includes('main_users'));
    });

    it('prefixes explicit schema migrations and runtime SQL', () => {
      const collection = collectionInSchema('crm', 'users');
      const migrations = migrationsFor(
        databaseInSchemaWithIndexes('crm', 'users', {
          indexes: {},
        }).database,
      );
      const { query } = formatSQL(migrations[0]!.sqls[0]!, sqliteFormatter);
      const builder = builderFor(collection);
      const insert = formatSQL(
        builder.insertOne({ _id: '1', name: 'Oskar' }),
        sqliteFormatter,
      );

      assert.equal(
        migrations[0]!.name,
        'pongoCollection:crm:users:001:createtable',
      );
      assert.ok(
        query.includes('CREATE TABLE IF NOT EXISTS dumbo_crm_table_users'),
      );
      assert.ok(
        insert.query.includes('INSERT OR IGNORE INTO dumbo_crm_table_users'),
      );
    });

    it('keeps ambiguous logical schema tuples on distinct physical tables', () => {
      const first = databaseInSchemaWithIndexes('a', 'b_c', {
        indexes: {},
      }).database;
      const second = databaseInSchemaWithIndexes('a_b', 'c', {
        indexes: {},
      }).database;
      const firstSQL = formatSQL(
        migrationsFor(first)[0]!.sqls[0]!,
        sqliteFormatter,
      ).query;
      const secondSQL = formatSQL(
        migrationsFor(second)[0]!.sqls[0]!,
        sqliteFormatter,
      ).query;

      assert.notEqual(firstSQL, secondSQL);
      assert.ok(firstSQL.includes('dumbo_a_table_b__c'));
      assert.ok(secondSQL.includes('dumbo_a__b_table_c'));
    });

    it('reserves the mapped-name prefix for native tables and indexes', () => {
      assert.throws(
        () =>
          formatSQL(
            builderFor(collectionInSchema('main', 'dumbo_users')).findOne(
              SQL``,
            ),
            sqliteFormatter,
          ),
        /SQLite table names starting with dumbo_ are reserved/,
      );
      assert.throws(
        () =>
          migrationsFor(
            databaseInSchemaWithIndexes('main', 'users', {
              indexes: {
                email: pongoSchema.index('dumbo_users_email_idx', 'email'),
              },
            }).database,
          ),
        /SQLite index names starting with dumbo_ are reserved/,
      );
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
        schemaIncludes: 'CREATE TABLE IF NOT EXISTS dumbo_crm_table_users',
      },
      {
        name: 'insertOne',
        sql: (builder) => builder.insertOne({ _id: '1', email: 'a@test' }),
        defaultIncludes: 'INSERT OR IGNORE INTO users',
        schemaIncludes: 'INSERT OR IGNORE INTO dumbo_crm_table_users',
      },
      {
        name: 'insertMany',
        sql: (builder) => builder.insertMany([{ _id: '1', email: 'a@test' }]),
        defaultIncludes: 'INSERT OR IGNORE INTO users',
        schemaIncludes: 'INSERT OR IGNORE INTO dumbo_crm_table_users',
      },
      {
        name: 'insertOrReplace',
        sql: (builder) =>
          builder.insertOrReplace([{ _id: '1', email: 'a@test' }]),
        defaultIncludes: 'INSERT INTO users',
        schemaIncludes: 'INSERT INTO dumbo_crm_table_users',
      },
      {
        name: 'updateOne',
        sql: (builder) =>
          builder.updateOne<{ email: string; name: string }>(
            { email: 'a@test' },
            { $set: { name: 'A' } },
          ),
        defaultIncludes: 'UPDATE users',
        schemaIncludes: 'UPDATE dumbo_crm_table_users',
      },
      {
        name: 'replaceOne',
        sql: (builder) =>
          builder.replaceOne<{ email: string; name: string }>(
            { email: 'a@test' },
            { email: 'b@test', name: 'B' },
          ),
        defaultIncludes: 'UPDATE users',
        schemaIncludes: 'UPDATE dumbo_crm_table_users',
      },
      {
        name: 'updateMany',
        sql: (builder) =>
          builder.updateMany<{ email: string; name: string }>(
            { email: 'a@test' },
            { $set: { name: 'A' } },
          ),
        defaultIncludes: 'UPDATE users',
        schemaIncludes: 'UPDATE dumbo_crm_table_users',
      },
      {
        name: 'deleteOne',
        sql: (builder) => builder.deleteOne({ email: 'a@test' }),
        defaultIncludes: 'DELETE FROM users',
        schemaIncludes: 'DELETE FROM dumbo_crm_table_users',
      },
      {
        name: 'deleteMany',
        sql: (builder) => builder.deleteMany({ email: 'a@test' }),
        defaultIncludes: 'DELETE FROM users',
        schemaIncludes: 'DELETE FROM dumbo_crm_table_users',
      },
      {
        name: 'replaceMany',
        sql: (builder) => builder.replaceMany([{ _id: '1', email: 'a@test' }]),
        defaultIncludes: 'UPDATE users',
        schemaIncludes: 'UPDATE dumbo_crm_table_users',
      },
      {
        name: 'deleteManyByIds',
        sql: (builder) => builder.deleteManyByIds([{ _id: '1' }]),
        defaultIncludes: 'DELETE FROM users',
        schemaIncludes: 'DELETE FROM dumbo_crm_table_users',
      },
      {
        name: 'findOne',
        sql: (builder) => builder.findOne({ email: 'a@test' }),
        defaultIncludes: 'FROM users',
        schemaIncludes: 'FROM dumbo_crm_table_users',
      },
      {
        name: 'find',
        sql: (builder) => builder.find({}),
        defaultIncludes: 'FROM users',
        schemaIncludes: 'FROM dumbo_crm_table_users',
      },
      {
        name: 'countDocuments',
        sql: (builder) => builder.countDocuments({}),
        defaultIncludes: 'FROM users',
        schemaIncludes: 'FROM dumbo_crm_table_users',
      },
      {
        name: 'rename',
        sql: (builder) => builder.rename('archived_users'),
        defaultIncludes: 'ALTER TABLE users RENAME TO archived_users',
        schemaIncludes:
          'ALTER TABLE dumbo_crm_table_users RENAME TO dumbo_crm_table_archived__users',
      },
      {
        name: 'drop',
        sql: (builder) => builder.drop(),
        defaultIncludes: 'DROP TABLE IF EXISTS users',
        schemaIncludes: 'DROP TABLE IF EXISTS dumbo_crm_table_users',
      },
    ];

    for (const testCase of runtimeSQLCases) {
      it(`uses default and prefixed schema tables in ${testCase.name}`, () => {
        const defaultBuilder = builderFor(collectionInSchema('main', 'users'));
        const schemaBuilder = builderFor(collectionInSchema('crm', 'users'));
        const defaultSQL = singleLine(
          formatSQL(testCase.sql(defaultBuilder), sqliteFormatter).query,
        );
        const schemaSQL = singleLine(
          formatSQL(testCase.sql(schemaBuilder), sqliteFormatter).query,
        );

        assert.ok(
          defaultSQL.includes(testCase.defaultIncludes),
          `${testCase.name} default got: ${defaultSQL}`,
        );
        assert.ok(
          !defaultSQL.includes('dumbo_crm_table_users'),
          `${testCase.name} default should not use the CRM table: ${defaultSQL}`,
        );
        assert.ok(
          schemaSQL.includes(testCase.schemaIncludes),
          `${testCase.name} schema got: ${schemaSQL}`,
        );
      });
    }

    it('keeps declared JSON path indexes on the collection table', () => {
      const indexes = {
        email: pongoSchema.index('users_email_idx', 'email'),
        externalId: pongoSchema.index.unique('users_external_id_uq', [
          'external',
          'id',
        ]),
      };
      const { database, collection } = databaseInSchemaWithIndexes(
        'main',
        'users',
        {
          indexes,
        },
      );
      const migrations = migrationsFor(database);
      const queries = migrations.map(
        (migration) => formatSQL(migration.sqls[0]!, sqliteFormatter).query,
      );

      assert.equal(migrations.length, 3);
      assert.ok(
        queries[1]?.includes(
          "CREATE INDEX users_email_idx ON users (json_extract(data, '$.email'))",
        ),
      );
      assert.ok(
        queries[2]?.includes(
          "CREATE UNIQUE INDEX users_external_id_uq ON users (json_extract(data, '$.external.id'))",
        ),
      );
      const email = collection.indexes.email;
      const externalId = collection.indexes.externalId;
      assert.ok(email);
      assert.ok(externalId);
      assert.strictEqual(email.indexName, 'users_email_idx');
      assert.strictEqual(email.tableName, undefined);
      assert.strictEqual(externalId.isUnique, true);
    });

    it('keeps declared indexes on prefixed schema tables', () => {
      const indexes = {
        email: pongoSchema.index('users_email_idx', 'email'),
      };
      const { database, collection } = databaseInSchemaWithIndexes(
        'crm',
        'users',
        {
          indexes,
        },
      );
      const migrations = migrationsFor(database);
      const indexSQL = formatSQL(
        migrations[1]!.sqls[0]!,
        sqliteFormatter,
      ).query;

      assert.equal(migrations.length, 2);
      assert.equal(collection.databaseSchemaName, undefined);
      const email = collection.indexes.email;
      assert.ok(email);
      assert.strictEqual(email.indexName, indexes.email.indexName);
      assert.ok(
        indexSQL.includes(
          'CREATE INDEX dumbo_crm_table_users_index_users__email__idx ON dumbo_crm_table_users',
        ),
        `got: ${indexSQL}`,
      );
      assert.equal(email.databaseSchemaName, undefined);
    });

    it('keeps declared document JSON indexes on the collection table', () => {
      const indexes = {
        email: pongoSchema.index('users_email_idx', 'email'),
        document: pongoSchema.index.json('users_data_idx'),
      };
      const { database, collection } = databaseInSchemaWithIndexes(
        'main',
        'users',
        {
          indexes,
        },
      );
      const migrations = migrationsFor(database);

      assert.deepStrictEqual(
        migrations.map((migration) => migration.name),
        [
          'pongoCollection:users:001:createtable',
          'pongoIndex:main:users:users_email_idx:create',
          'pongoIndex:main:users:users_data_idx:create',
        ],
      );
      const document = collection.indexes.document;
      assert.ok(document);
      assert.strictEqual(document.indexName, 'users_data_idx');
    });

    it('keeps custom index SQL hooks on the collection table', () => {
      let resolvedReferences:
        { tableReference: string; indexReference: string } | undefined;
      const indexes = {
        custom: pongoSchema.index.custom(
          'users_custom_data_idx',
          ({ tableReference, indexReference }) => {
            resolvedReferences = {
              tableReference: formatSQL(tableReference, sqliteFormatter).query,
              indexReference: formatSQL(indexReference, sqliteFormatter).query,
            };
            return SQL`CREATE INDEX IF NOT EXISTS ${indexReference} ON ${tableReference} (data)`;
          },
        ),
      };
      const { database, collection } = databaseInSchemaWithIndexes(
        'crm',
        'users',
        {
          indexes,
        },
      );
      const migrations = migrationsFor(database);

      assert.equal(migrations.length, 2);
      assert.deepStrictEqual(resolvedReferences, {
        tableReference: 'dumbo_crm_table_users',
        indexReference: 'dumbo_crm_table_users_index_users__custom__data__idx',
      });
      const custom = collection.indexes.custom;
      assert.ok(custom);
      assert.equal(typeof custom.sql, 'function');
    });
  });

  describe('insertOne', () => {
    it('should generate correct INSERT statement', () => {
      const document = { _id: randomUUID(), name: 'Test', age: 30 };
      const result = builder.insertOne(document);
      const { query } = formatSQL(result, sqliteFormatter);

      assert.ok(query.includes('INSERT OR IGNORE INTO'));
      assert.ok(query.includes('(_id, data, _version)'));
    });

    it('binds serialized document JSON without SQL-escaping string content', () => {
      const result = builder.insertOne(specialDocument);
      const { params } = formatSQL(result, sqliteFormatter);

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
      const { params } = formatSQL(result, sqliteFormatter);

      assert.deepStrictEqual(params, [
        specialDocument._id,
        specialDocumentJSON,
        '1',
      ]);
    });

    it('insertOrReplace binds serialized JSON without SQL escaping', () => {
      const result = builder.insertOrReplace([specialDocument]);
      const { params } = formatSQL(result, sqliteFormatter);

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
      const { params } = formatSQL(result, sqliteFormatter);

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
      const { params } = formatSQL(result, sqliteFormatter);

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
      const { params } = formatSQL(result, sqliteFormatter);

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
      const { params } = formatSQL(result, sqliteFormatter);

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
      const { query } = formatSQL(result, sqliteFormatter);

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
      const { params } = formatSQL(result, sqliteFormatter);
      // two ids + two serialized docs
      assert.ok(params.includes('a'));
      assert.ok(params.includes('b'));
    });
  });

  describe('find operations', () => {
    it('should handle empty filter', () => {
      const result = builder.find({});
      const { query } = formatSQL(result, sqliteFormatter);

      assert.ok(query.includes('SELECT data, _id, _version FROM'));
      assert.ok(!query.includes('WHERE'));
    });

    it('should handle simple equality filter', () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
      const result = builder.find({ name: 'John' } as any);
      const { query } = formatSQL(result, sqliteFormatter);

      assert.ok(query.includes('WHERE'));
      assert.ok(query.includes('json_extract'));
    });

    it('binds string filter values without SQL escaping', () => {
      const result = builder.find({
        title: specialDocument.title,
      });
      const { params } = formatSQL(result, sqliteFormatter);

      assert.deepStrictEqual(params, [
        specialDocument.title,
        specialDocument.title,
      ]);
    });

    it('binds nested object equality values without SQL escaping', () => {
      const result = builder.find({
        nested: { quote: specialDocument.nested.quote },
      });
      const { params } = formatSQL(result, sqliteFormatter);

      assert.deepStrictEqual(params, [
        specialDocument.nested.quote,
        specialDocument.nested.quote,
      ]);
    });

    it('should handle limit and skip options', () => {
      const result = builder.find({}, { limit: 10, skip: 5 });
      const { query } = formatSQL(result, sqliteFormatter);

      assert.ok(query.includes('LIMIT'));
      assert.ok(query.includes('OFFSET'));
    });

    it('empty sort object produces no ORDER BY clause', () => {
      const result = builder.find({}, { sort: {} });
      const { query } = formatSQL(result, sqliteFormatter);
      assert.ok(!query.includes('ORDER BY'), `got: ${query}`);
    });

    it('sorts ASC by a single field', () => {
      const result = builder.find({}, { sort: { name: 1 } });
      const { query } = formatSQL(result, sqliteFormatter);
      assert.ok(
        query.includes(`ORDER BY json_extract(data, '$.name') ASC`),
        `got: ${query}`,
      );
    });

    it('sorts DESC by a single field', () => {
      const result = builder.find({}, { sort: { created_at: -1 } });
      const { query } = formatSQL(result, sqliteFormatter);
      assert.ok(
        query.includes(`ORDER BY json_extract(data, '$.created_at') DESC`),
        `got: ${query}`,
      );
    });

    it('ORDER BY appears before LIMIT', () => {
      const result = builder.find({}, { sort: { name: 1 }, limit: 10 });
      const { query } = formatSQL(result, sqliteFormatter);
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
      const { query } = formatSQL(result, sqliteFormatter);
      assert.ok(/ORDER BY.*LIMIT.*OFFSET/s.test(query), `got: ${query}`);
    });

    it('sorts by multiple fields', () => {
      const result = builder.find({}, { sort: { age: -1, name: 1 } });
      const { query } = formatSQL(result, sqliteFormatter);
      assert.ok(
        query.includes(
          `ORDER BY json_extract(data, '$.age') DESC,json_extract(data, '$.name') ASC`,
        ),
        `got: ${query}`,
      );
    });

    it('sorts by a nested field', () => {
      const result = builder.find({}, { sort: { 'address.city': 1 } });
      const { query } = formatSQL(result, sqliteFormatter);
      assert.ok(
        query.includes(`ORDER BY json_extract(data, '$.address.city') ASC`),
        `got: ${query}`,
      );
    });

    it('sorts by a deeply nested field (3 levels)', () => {
      const result = builder.find({}, { sort: { 'a.b.c': -1 } });
      const { query } = formatSQL(result, sqliteFormatter);
      assert.ok(
        query.includes(`ORDER BY json_extract(data, '$.a.b.c') DESC`),
        `got: ${query}`,
      );
    });

    it('sorts by _id using the native column, not the JSON field', () => {
      const result = builder.find({}, { sort: { _id: 1 } });
      const { query } = formatSQL(result, sqliteFormatter);
      assert.ok(query.includes('ORDER BY _id ASC'), `got: ${query}`);
      assert.ok(!query.includes('json_extract'), `got: ${query}`);
    });

    it('sorts by _version using the native column, not the JSON field', () => {
      const result = builder.find({}, { sort: { _version: -1 } });
      const { query } = formatSQL(result, sqliteFormatter);
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
      const { query } = formatSQL(result, sqliteFormatter);

      assert.ok(query.includes('UPDATE'));
      assert.ok(query.includes('json_patch') || query.includes('json_set'));
    });

    it('should handle $inc operator', () => {
      const result = builder.updateOne<{ count: number }>(
        { _id: 'test-id' },
        { $inc: { count: 1 } },
      );
      const { query } = formatSQL(result, sqliteFormatter);

      assert.ok(query.includes('json_set'));
      assert.ok(query.includes('json_extract'));
    });

    it('should handle $push operator', () => {
      const result = builder.updateOne<{ tags: string }>(
        { _id: 'test-id' },
        { $push: { tags: 'new-tag' } },
      );
      const { query } = formatSQL(result, sqliteFormatter);

      assert.ok(query.includes('json_set'));
      assert.ok(query.includes('json_type') || query.includes('json_array'));
    });
  });

  describe('delete operations', () => {
    it('should generate correct DELETE statement', () => {
      const result = builder.deleteOne({ _id: 'test-id' });
      const { query } = formatSQL(result, sqliteFormatter);

      assert.ok(query.includes('DELETE FROM'));
      assert.ok(query.includes('WHERE'));
    });

    it('should handle expected version in deleteOne', () => {
      const result = builder.deleteOne(
        { _id: 'test-id' },
        { expectedVersion: 2n },
      );
      const { query } = formatSQL(result, sqliteFormatter);

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
      formatSQL(
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
      const { query } = formatSQL(result, sqliteFormatter);

      assert.ok(query.includes('SELECT COUNT(1) as count'));
      assert.ok(query.includes('WHERE'));
    });
  });

  describe('logical operators', () => {
    it('supports top-level $or', () => {
      const result = builder.find<{ flag: boolean }>({
        $or: [{ flag: true }, { flag: false }],
      });
      const { query } = formatSQL(result, sqliteFormatter);

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
      const { query } = formatSQL(result, sqliteFormatter);

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
      const { query } = formatSQL(result, sqliteFormatter);

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
