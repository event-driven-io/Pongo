import { JSONSerializer, SQL } from '@event-driven-io/dumbo';
import { pgFormatter } from '@event-driven-io/dumbo/pg';
import assert from 'assert';
import { describe, it } from 'vitest';
import { postgresSQLBuilder } from '.';
import type { ExpectedDocumentVersion } from '../../../../core';

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
      JSONSerializer.serialize({ title: specialDocument.title }),
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

  it('find binds string filter values inside JSON containment without SQL escaping', () => {
    const result = builder.find({
      title: specialDocument.title,
    });
    const { params } = SQL.format(result, pgFormatter);

    assert.deepStrictEqual(params, [
      JSONSerializer.serialize({ title: specialDocument.title }),
    ]);
  });

  it('find binds nested object equality values without SQL escaping', () => {
    const result = builder.find({
      nested: { quote: specialDocument.nested.quote },
    });
    const { params } = SQL.format(result, pgFormatter);

    assert.deepStrictEqual(params, [
      JSONSerializer.serialize({
        nested: { quote: specialDocument.nested.quote },
      }),
    ]);
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
