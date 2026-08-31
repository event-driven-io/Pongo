import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import assert from 'assert';
import { aroundEach, describe, it } from 'vitest';
import { CloudflareDurableObjectSQLiteDriverType } from '../../../../cloudflare';
import {
  count,
  dumbo,
  JSONSerializer,
  SQL,
  type Dumbo,
} from '../../../../index';

describe('Cloudflare Durable Object SQLite SQL formatter', () => {
  let pool: Dumbo;

  aroundEach(async (runTest) => {
    const stub = env.TEST_OBJECT.get(env.TEST_OBJECT.newUniqueId());

    await runInDurableObject(stub, async (_instance, state) => {
      pool = dumbo({
        driverType: CloudflareDurableObjectSQLiteDriverType,
        storage: state.storage,
      });

      await pool.execute.query(
        SQL`CREATE TABLE test_users (id INTEGER PRIMARY KEY, name TEXT)`,
      );
      await pool.execute.query(
        SQL`INSERT INTO test_users (name) VALUES ('Alice'), ('Bob')`,
      );

      try {
        await runTest();
      } finally {
        await pool.close();
      }
    });
  });

  describe('Direct Array Handling', () => {
    it('throws error for empty arrays in IN clauses', async () => {
      const emptyIds: number[] = [];

      await assert.rejects(
        pool.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_users WHERE id IN ${emptyIds}`,
        ),
        /Empty arrays are not supported/,
      );
    });

    it('handles non-empty arrays correctly', async () => {
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
    it('handles empty arrays by returning no records', async () => {
      const emptyIds: number[] = [];
      const result = await count(
        pool.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_users WHERE ${SQL.in('id', emptyIds)}`,
        ),
      );

      assert.strictEqual(result, 0);
    });

    it('handles numeric arrays', async () => {
      const result = await count(
        pool.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_users WHERE ${SQL.in('id', [1])}`,
        ),
      );

      assert.strictEqual(result, 1);
    });

    it('handles a string array with one value', async () => {
      const result = await count(
        pool.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_users WHERE ${SQL.in('name', ['Alice'])}`,
        ),
      );

      assert.strictEqual(result, 1);
    });

    it('handles a string array with multiple values', async () => {
      const result = await count(
        pool.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_users WHERE ${SQL.in('name', ['Alice', 'Bob'])}`,
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
    it('handles params mode', async () => {
      const result = await count(
        pool.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_users WHERE ${SQL.in('id', [1, 2], { mode: 'params' })}`,
        ),
      );

      assert.strictEqual(result, 2);
    });

    it('handles native mode by falling back to params', async () => {
      const result = await count(
        pool.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_users WHERE ${SQL.in('id', [1, 2], { mode: 'native' })}`,
        ),
      );

      assert.strictEqual(result, 2);
    });

    it('handles string arrays in params mode', async () => {
      const result = await count(
        pool.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_users WHERE ${SQL.in('name', ['Alice', 'Bob'], { mode: 'params' })}`,
        ),
      );

      assert.strictEqual(result, 2);
    });
  });

  describe('SQL.array Helper', () => {
    it('handles params mode', async () => {
      const result = await count(
        pool.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_users WHERE id IN (${SQL.array([1, 2], { mode: 'params' })})`,
        ),
      );

      assert.strictEqual(result, 2);
    });

    it('handles native mode by falling back to params', async () => {
      const result = await count(
        pool.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_users WHERE name IN (${SQL.array(['Alice'], { mode: 'native' })})`,
        ),
      );

      assert.strictEqual(result, 1);
    });

    it('defaults to params mode', async () => {
      const result = await count(
        pool.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_users WHERE name IN (${SQL.array(['Alice', 'Bob'])})`,
        ),
      );

      assert.strictEqual(result, 2);
    });
  });

  describe('Object Params Handling', () => {
    it('stores object values containing apostrophes', async () => {
      const document = { title: "director's cut" };
      await pool.execute.query(
        SQL`CREATE TABLE test_documents (id INTEGER PRIMARY KEY, data TEXT)`,
      );

      await pool.execute.command(
        SQL`INSERT INTO test_documents (id, data) VALUES (1, ${document})`,
      );
      const result = await pool.execute.query<{ data: string }>(
        SQL`SELECT data FROM test_documents WHERE id = 1`,
      );

      assert.strictEqual(
        result.rows[0]!.data,
        JSONSerializer.serialize(document),
      );
    });

    it('stores nested object values containing apostrophes', async () => {
      const document = {
        title: "director's cut",
        metadata: { note: "author's note" },
      };
      await pool.execute.query(
        SQL`CREATE TABLE test_documents (id INTEGER PRIMARY KEY, data TEXT)`,
      );

      await pool.execute.command(
        SQL`INSERT INTO test_documents (id, data) VALUES (2, ${document})`,
      );
      const result = await pool.execute.query<{ data: string }>(
        SQL`SELECT data FROM test_documents WHERE id = 2`,
      );

      assert.strictEqual(
        result.rows[0]!.data,
        JSONSerializer.serialize(document),
      );
    });
  });
});
