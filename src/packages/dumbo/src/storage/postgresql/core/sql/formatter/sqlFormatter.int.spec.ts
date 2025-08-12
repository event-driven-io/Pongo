import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import assert from 'assert';
import { after, before, describe, it } from 'node:test';
import { PostgreSQLConnectionString } from '../..';
import { type Dumbo } from '../../../../..';
import { count, SQL } from '../../../../../core';
import { dumbo } from '../../../../../pg';

void describe('PostgreSQL SQL Formatter Integration Tests', () => {
  let pool: Dumbo;
  let postgres: StartedPostgreSqlContainer;
  let connectionString: PostgreSQLConnectionString;

  before(async () => {
    postgres = await new PostgreSqlContainer().start();
    connectionString = PostgreSQLConnectionString(postgres.getConnectionUri());
    pool = dumbo({ connectionString });

    await pool.execute.batchCommand([
      SQL`CREATE TABLE test_users (id SERIAL PRIMARY KEY, name TEXT)`,
      SQL`INSERT INTO test_users (name) VALUES ('Alice'), ('Bob')`,
    ]);
  });

  after(async () => {
    await pool.close();
    await postgres.stop();
  });

  void describe('Direct Array Handling', () => {
    void it('should throw error for empty arrays in IN clauses', async () => {
      const emptyIds: number[] = [];

      try {
        await pool.execute.query(
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

    void it('should handle non-empty arrays correctly', async () => {
      const ids = [1];
      const result = await count(
        pool.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_users WHERE id IN ${ids}`,
        ),
      );

      assert.strictEqual(result, 1);
    });
  });

  void describe('SQL.in Helper', () => {
    void it('should handle empty arrays by returning FALSE, so no records', async () => {
      const emptyIds: number[] = [];
      const result = await count(
        pool.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_users WHERE ${SQL.in('id', emptyIds)}`,
        ),
      );

      assert.strictEqual(result, 0);
    });

    void it('should handle non-empty arrays with PostgreSQL ANY optimization', async () => {
      const ids = [1];
      const result = await count(
        pool.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_users WHERE ${SQL.in('id', ids)}`,
        ),
      );

      assert.strictEqual(result, 1);
    });

    void it('should handle string arrays correctly', async () => {
      const names = ['Alice'];
      const result = await count(
        pool.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_users WHERE ${SQL.in('name', names)}`,
        ),
      );

      assert.strictEqual(result, 1);
    });

    void it('should handle empty string arrays', async () => {
      const emptyNames: string[] = [];
      const result = await count(
        pool.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_users WHERE ${SQL.in('name', emptyNames)}`,
        ),
      );

      assert.strictEqual(result, 0);
    });
  });
});
