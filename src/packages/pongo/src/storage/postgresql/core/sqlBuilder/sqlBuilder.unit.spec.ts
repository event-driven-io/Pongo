import { JSONSerializer, SQL } from '@event-driven-io/dumbo';
import { pgFormatter } from '@event-driven-io/dumbo/pg';
import assert from 'assert';
import { describe, it } from 'vitest';
import { postgresSQLBuilder } from '.';

describe('find() query options', () => {
  it('should apply limit correctly', () => {
    const query = postgresSQLBuilder('users', JSONSerializer).find(
      {},
      { limit: 4 },
    );
    assert.deepStrictEqual(SQL.format(query, pgFormatter), {
      query: 'SELECT data, _version FROM users LIMIT $1 ;',
      params: [4],
    });
  });

  it('should apply offset correctly', () => {
    const query = postgresSQLBuilder('users', JSONSerializer).find(
      {},
      { skip: 123 },
    );
    assert.deepStrictEqual(SQL.format(query, pgFormatter), {
      query: 'SELECT data, _version FROM users OFFSET $1 ;',
      params: [123],
    });
  });

  it('should apply limit and offset in correct order', () => {
    const query = postgresSQLBuilder('users', JSONSerializer).find(
      {},
      { limit: 20, skip: 123 },
    );
    assert.deepStrictEqual(SQL.format(query, pgFormatter), {
      query: 'SELECT data, _version FROM users LIMIT $1 OFFSET $2 ;',
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
