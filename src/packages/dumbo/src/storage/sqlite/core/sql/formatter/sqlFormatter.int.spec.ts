import assert from 'assert';
import { after, before, describe, it } from 'node:test';
import { type Dumbo } from '../../../../..';
import { count, SQL } from '../../../../../core';
import { dumbo } from '../../../../../sqlite3';
import { InMemorySQLiteDatabase } from '../../connections';

void describe('SQLite SQL Formatter Integration Tests', () => {
  let db: Dumbo;

  before(() => {
    db = dumbo({
      connectionString: InMemorySQLiteDatabase,
      connector: 'SQLite:sqlite3',
    });
  });

  after(async () => {
    await db.close();
  });

  before(async () => {
    // Create test table for all tests
    await db.execute.query(
      SQL`CREATE TABLE test_users (id INTEGER PRIMARY KEY, name TEXT)`,
    );

    // Insert test data
    await db.execute.query(
      SQL`INSERT INTO test_users (name) VALUES ('Alice'), ('Bob')`,
    );
  });

  void describe('Direct Array Handling', () => {
    void it('throws error for empty arrays in IN clauses', async () => {
      const emptyIds: number[] = [];

      try {
        await db.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_users WHERE id IN ${emptyIds}`,
        );
        assert.fail('Should have thrown error for empty array');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(
          error.message.includes(
            'Empty arrays in IN clauses are not supported',
          ),
        );
      }
    });

    void it('handles non-empty arrays correctly', async () => {
      // Non-empty arrays should still work
      const names = ['Alice'];
      const result = await count(
        db.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_users WHERE name IN ${names}`,
        ),
      );

      assert.strictEqual(result, 1);
    });
  });

  void describe('SQL.in Helper', () => {
    void it('handles empty arrays by returning FALSE, so no records', async () => {
      const emptyIds: number[] = [];
      const result = await count(
        db.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_users WHERE ${SQL.in('id', emptyIds)}`,
        ),
      );

      assert.strictEqual(result, 0);
    });

    void it('handles non-empty arrays with standard IN clause', async () => {
      // Non-empty array should use standard IN clause for SQLite
      const ids = [1];
      const result = await count(
        db.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_users WHERE ${SQL.in('id', ids)}`,
        ),
      );

      assert.strictEqual(result, 1);
    });

    void it('handles string arrays correctly', async () => {
      const names = ['Alice'];
      const result = await count(
        db.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_users WHERE ${SQL.in('name', names)}`,
        ),
      );

      assert.strictEqual(result, 1);
    });

    void it('handles empty string arrays', async () => {
      const emptyNames: string[] = [];
      const result = await count(
        db.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_users WHERE ${SQL.in('name', emptyNames)}`,
        ),
      );

      assert.strictEqual(result, 0);
    });
  });
});
