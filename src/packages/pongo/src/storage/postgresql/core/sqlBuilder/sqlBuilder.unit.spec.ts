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
    assert.ok(sql.includes(`ORDER BY data ->> 'name' ASC`), `got: ${sql}`);
  });

  it('sorts DESC by a single field', () => {
    const query = builder.find({}, { sort: { created_at: -1 } });
    const { query: sql } = SQL.format(query, pgFormatter);
    assert.ok(
      sql.includes(`ORDER BY data ->> 'created_at' DESC`),
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
});
