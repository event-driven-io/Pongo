import assert from 'assert';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { sqlite3DumboDriver } from '..';
import { dumbo, type Dumbo } from '../../../..';
import { count, SQL } from '../../../../core';
import { InMemorySQLiteDatabase } from '../../core/connections';

describe('SQLite3 SQL Formatter Integration Tests', () => {
  let pool: Dumbo;

  beforeAll(() => {
    pool = dumbo({
      connectionString: InMemorySQLiteDatabase,
      driver: sqlite3DumboDriver,
    });
  });

  afterAll(async () => {
    await pool.close();
  });

  beforeAll(async () => {
    // Create test table for all tests
    await pool.execute.query(
      SQL`CREATE TABLE test_users (id INTEGER PRIMARY KEY, name TEXT)`,
    );

    // Insert test data
    await pool.execute.query(
      SQL`INSERT INTO test_users (name) VALUES ('Alice'), ('Bob')`,
    );
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

    it('handles non-empty arrays correctly', async () => {
      // Non-empty arrays should still work
      const names = ['Alice'];
      const result = await count(
        pool.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_users WHERE name IN (${names})`,
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

    it('handles non-empty arrays with standard IN clause', async () => {
      // Non-empty array should use standard IN clause for SQLite
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

    it('handles empty string arrays', async () => {
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
    it('handles mode: params using IN syntax (default for SQLite)', async () => {
      const ids = [1, 2];
      const result = await count(
        pool.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_users WHERE ${SQL.in('id', ids, { mode: 'params' })}`,
        ),
      );

      assert.strictEqual(result, 2);
    });

    it('handles mode: native falling back to params (SQLite has no native arrays)', async () => {
      const ids = [1, 2];
      const result = await count(
        pool.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_users WHERE ${SQL.in('id', ids, { mode: 'native' })}`,
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
    it('handles mode: params with IN syntax', async () => {
      const ids = [1, 2];
      const result = await count(
        pool.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_users WHERE id IN (${SQL.array(ids, { mode: 'params' })})`,
        ),
      );

      assert.strictEqual(result, 2);
    });

    it('handles mode: native falling back to params (SQLite has no native arrays)', async () => {
      const names = ['Alice'];
      const result = await count(
        pool.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_users WHERE name IN (${SQL.array(names, { mode: 'native' })})`,
        ),
      );

      assert.strictEqual(result, 1);
    });

    it('handles array without mode option (defaults to params for SQLite)', async () => {
      const names = ['Alice', 'Bob'];
      const result = await count(
        pool.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_users WHERE name IN (${SQL.array(names)})`,
        ),
      );

      assert.strictEqual(result, 2);
    });
  });
});
