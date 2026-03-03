import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import assert from 'assert';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { pgDumboDriver } from '..';
import { dumbo, type Dumbo } from '../../../..';
import { count, SQL } from '../../../../core';
import { PostgreSQLConnectionString } from '../../core';

describe('PostgreSQL SQL Formatter Integration Tests', () => {
  let pool: Dumbo;
  let postgres: StartedPostgreSqlContainer;
  let connectionString: PostgreSQLConnectionString;

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer('postgres:18.0').start();
    connectionString = PostgreSQLConnectionString(postgres.getConnectionUri());
    pool = dumbo({ connectionString, driver: pgDumboDriver });

    await pool.execute.batchCommand([
      SQL`CREATE TABLE test_users (id SERIAL PRIMARY KEY, name TEXT)`,
      SQL`INSERT INTO test_users (name) VALUES ('Alice'), ('Bob')`,
    ]);
  });

  afterAll(async () => {
    await pool.close();
    await postgres.stop();
  });

  describe('Direct Array Handling', () => {
    it('throws error for empty arrays in IN clauses', async () => {
      const emptyIds: number[] = [];

      try {
        await pool.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_users WHERE id IN ${emptyIds}`,
        );
        assert.fail('Should have thrown error for empty array');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('Empty arrays are not supported'));
      }
    });

    it('handles non-empty arrays', async () => {
      const ids = [1];
      const result = await count(
        pool.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_users WHERE id = ANY(${ids})`,
        ),
      );

      assert.strictEqual(result, 1);
    });
  });

  describe('SQL.in Helper', () => {
    it('handles empty arrays by returning FALSE, so no records', async () => {
      const emptyIds: number[] = [];
      const result = await count(
        pool.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_users WHERE ${SQL.in('id', emptyIds)}`,
        ),
      );

      assert.strictEqual(result, 0);
    });

    it('handles non-empty arrays', async () => {
      const ids = [1];
      const result = await count(
        pool.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_users WHERE ${SQL.in('id', ids)}`,
        ),
      );

      assert.strictEqual(result, 1);
    });

    it('handles string array with single value', async () => {
      const names = ['Alice'];
      const result = await count(
        pool.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_users WHERE ${SQL.in('name', names)}`,
        ),
      );

      assert.strictEqual(result, 1);
    });

    it('handles string array with multiple values', async () => {
      const names = ['Alice', 'Bob'];
      const result = await count(
        pool.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_users WHERE ${SQL.in('name', names)}`,
        ),
      );

      assert.strictEqual(result, 2);
    });

    it('handles empty string', async () => {
      const emptyNames: string[] = [];
      const result = await count(
        pool.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_users WHERE ${SQL.in('name', emptyNames)}`,
        ),
      );

      assert.strictEqual(result, 0);
    });
  });

  describe('SQL.in with mode option', () => {
    it('handles mode: native (default) using = ANY syntax', async () => {
      const ids = [1, 2];
      const result = await count(
        pool.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_users WHERE ${SQL.in('id', ids, { mode: 'native' })}`,
        ),
      );

      assert.strictEqual(result, 2);
    });

    it('handles mode: params using IN syntax with expanded params', async () => {
      const ids = [1, 2];
      const result = await count(
        pool.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_users WHERE ${SQL.in('id', ids, { mode: 'params' })}`,
        ),
      );

      assert.strictEqual(result, 2);
    });

    it('handles mode: params with string array', async () => {
      const names = ['Alice', 'Bob'];
      const result = await count(
        pool.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_users WHERE ${SQL.in('name', names, { mode: 'params' })}`,
        ),
      );

      assert.strictEqual(result, 2);
    });
  });

  describe('SQL.array helper', () => {
    it('handles mode: native (default) with = ANY', async () => {
      const ids = [1, 2];
      const result = await count(
        pool.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_users WHERE id = ANY(${SQL.array(ids, { mode: 'native' })})`,
        ),
      );

      assert.strictEqual(result, 2);
    });

    it('handles mode: params with IN syntax', async () => {
      const ids = [1, 2];
      const result = await count(
        pool.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_users WHERE id IN (${SQL.array(ids, { mode: 'params' })})`,
        ),
      );

      assert.strictEqual(result, 2);
    });

    it('handles array without mode option (defaults to native)', async () => {
      const names = ['Alice'];
      const result = await count(
        pool.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_users WHERE name = ANY(${SQL.array(names)})`,
        ),
      );

      assert.strictEqual(result, 1);
    });
  });
});
