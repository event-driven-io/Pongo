import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import assert from 'assert';
import { aroundEach, describe, it } from 'vitest';
import { SQL } from '../../../../core';
import { cloudflareDurableObjectSQLitePool } from '../pool';

describe('Cloudflare Durable Object SQLite executeCommand changes count accuracy', () => {
  let pool: ReturnType<typeof cloudflareDurableObjectSQLitePool>;

  aroundEach(async (runTest) => {
    const stub = env.TEST_OBJECT.get(env.TEST_OBJECT.newUniqueId());

    await runInDurableObject(stub, async (_instance, state) => {
      pool = cloudflareDurableObjectSQLitePool({ storage: state.storage });

      await pool.execute.command(
        SQL`CREATE TABLE changes_test (id INTEGER PRIMARY KEY, value TEXT)`,
      );

      try {
        await runTest();
      } finally {
        await pool.close();
      }
    });
  });

  it('returns correct rowCount for INSERT', async () => {
    const result = await pool.execute.command(
      SQL`INSERT INTO changes_test (id, value) VALUES (1, 'a')`,
    );
    assert.strictEqual(result.rowCount, 1);
  });

  it('returns correct rowCount for multi-row INSERT', async () => {
    const result = await pool.execute.command(
      SQL`INSERT INTO changes_test (id, value) VALUES (1, 'a'), (2, 'b'), (3, 'c')`,
    );
    assert.strictEqual(result.rowCount, 3);
  });

  it('returns correct rowCount for UPDATE', async () => {
    await pool.execute.command(
      SQL`INSERT INTO changes_test (id, value) VALUES (1, 'a'), (2, 'b'), (3, 'c')`,
    );
    const result = await pool.execute.command(
      SQL`UPDATE changes_test SET value = 'updated' WHERE id <= 2`,
    );
    assert.strictEqual(result.rowCount, 2);
  });

  it('counts updated table rows rather than index writes', async () => {
    await pool.execute.command(
      SQL`CREATE INDEX changes_test_value_idx ON changes_test (value)`,
    );
    await pool.execute.command(
      SQL`INSERT INTO changes_test (id, value) VALUES (1, 'a'), (2, 'b')`,
    );

    const result = await pool.execute.command(
      SQL`UPDATE changes_test SET value = 'updated' WHERE id = 1`,
    );

    assert.strictEqual(result.rowCount, 1);
  });

  it('returns correct rowCount for DELETE', async () => {
    await pool.execute.command(
      SQL`INSERT INTO changes_test (id, value) VALUES (1, 'a'), (2, 'b'), (3, 'c')`,
    );
    const result = await pool.execute.command(
      SQL`DELETE FROM changes_test WHERE id >= 2`,
    );
    assert.strictEqual(result.rowCount, 2);
  });

  it('returns 0 rowCount when no rows affected', async () => {
    const result = await pool.execute.command(
      SQL`UPDATE changes_test SET value = 'x' WHERE id = 999`,
    );
    assert.strictEqual(result.rowCount, 0);
  });

  it('returns correct rowCount for INSERT with RETURNING', async () => {
    const result = await pool.execute.command(
      SQL`INSERT INTO changes_test (id, value) VALUES (1, 'a'), (2, 'b') RETURNING id`,
    );
    assert.strictEqual(result.rowCount, 2);
    assert.deepStrictEqual(result.rows, [{ id: 1 }, { id: 2 }]);
  });

  it('returns correct rowCount for UPDATE with RETURNING', async () => {
    await pool.execute.command(
      SQL`INSERT INTO changes_test (id, value) VALUES (1, 'a'), (2, 'b'), (3, 'c')`,
    );
    const result = await pool.execute.command(
      SQL`UPDATE changes_test SET value = 'updated' WHERE id <= 2 RETURNING id, value`,
    );
    assert.strictEqual(result.rowCount, 2);
    assert.deepStrictEqual(result.rows, [
      { id: 1, value: 'updated' },
      { id: 2, value: 'updated' },
    ]);
  });

  it('returns correct rowCount for INSERT ON CONFLICT DO NOTHING with RETURNING', async () => {
    await pool.execute.command(
      SQL`INSERT INTO changes_test (id, value) VALUES (1, 'existing')`,
    );
    const result = await pool.execute.command(
      SQL`INSERT INTO changes_test (id, value) VALUES (1, 'duplicate'), (2, 'new') ON CONFLICT DO NOTHING RETURNING id`,
    );
    assert.strictEqual(result.rowCount, 1);
    assert.deepStrictEqual(result.rows, [{ id: 2 }]);
  });

  it('returns correct rowCount across sequential commands', async () => {
    const r1 = await pool.execute.command(
      SQL`INSERT INTO changes_test (id, value) VALUES (1, 'a')`,
    );
    assert.strictEqual(r1.rowCount, 1);

    const r2 = await pool.execute.command(
      SQL`INSERT INTO changes_test (id, value) VALUES (2, 'b'), (3, 'c')`,
    );
    assert.strictEqual(r2.rowCount, 2);

    const r3 = await pool.execute.command(
      SQL`UPDATE changes_test SET value = 'x' WHERE id = 1`,
    );
    assert.strictEqual(r3.rowCount, 1);

    const r4 = await pool.execute.command(
      SQL`DELETE FROM changes_test WHERE id >= 1`,
    );
    assert.strictEqual(r4.rowCount, 3);
  });

  it('returns zero for DDL after successful DML', async () => {
    const insert = await pool.execute.command(
      SQL`INSERT INTO changes_test (id, value) VALUES (1, 'a')`,
    );
    const createIndex = await pool.execute.command(
      SQL`CREATE INDEX changes_test_value_idx ON changes_test (value)`,
    );
    const update = await pool.execute.command(
      SQL`UPDATE changes_test SET value = 'updated' WHERE id = 1`,
    );

    assert.strictEqual(insert.rowCount, 1);
    assert.strictEqual(createIndex.rowCount, 0);
    assert.strictEqual(update.rowCount, 1);
  });

  it('returns rows for query and batchQuery with bound parameters', async () => {
    await pool.execute.command(
      SQL`INSERT INTO changes_test (id, value) VALUES (1, 'a'), (2, 'b')`,
    );

    const query = await pool.execute.query<{ id: number; value: string }>(
      SQL`SELECT id, value FROM changes_test WHERE id = ${2}`,
    );
    assert.strictEqual(query.rowCount, 1);
    assert.deepStrictEqual(query.rows, [{ id: 2, value: 'b' }]);

    const batch = await pool.execute.batchQuery<{ value: string }>([
      SQL`SELECT value FROM changes_test WHERE id = ${1}`,
      SQL`SELECT value FROM changes_test WHERE id = ${2}`,
    ]);
    assert.deepStrictEqual(batch, [
      { rowCount: 1, rows: [{ value: 'a' }] },
      { rowCount: 1, rows: [{ value: 'b' }] },
    ]);
  });

  it('stores supported bound parameter types through Cloudflare SqlStorage', async () => {
    await pool.execute.command(
      SQL`CREATE TABLE typed_items (id INTEGER PRIMARY KEY, date_value TEXT, bool_value INTEGER, false_value INTEGER, big_value INTEGER)`,
    );
    await pool.execute.command(
      SQL`INSERT INTO typed_items (id, date_value, bool_value, false_value, big_value) VALUES (${1}, ${new Date('2026-08-31T10:20:30.000Z')}, ${true}, ${false}, ${42n})`,
    );

    const result = await pool.execute.query<{
      date_value: string;
      bool_value: number;
      false_value: number;
      big_value: number;
    }>(
      SQL`SELECT date_value, bool_value, false_value, big_value FROM typed_items`,
    );

    assert.deepStrictEqual(result.rows, [
      {
        date_value: '2026-08-31T10:20:30.000Z',
        bool_value: 1,
        false_value: 0,
        big_value: 42,
      },
    ]);
  });

  it('preserves bigint binding precision', async () => {
    const value = 9_007_199_254_740_993n;
    await pool.execute.command(
      SQL`CREATE TABLE bigint_items (value TEXT NOT NULL)`,
    );
    await pool.execute.command(
      SQL`INSERT INTO bigint_items (value) VALUES (${value})`,
    );

    const result = await pool.execute.query<{ value: string }>(
      SQL`SELECT value FROM bigint_items`,
    );
    assert.deepStrictEqual(result.rows, [{ value: value.toString() }]);
  });
});
