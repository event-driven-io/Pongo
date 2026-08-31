import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import assert from 'assert';
import { aroundEach, describe, it } from 'vitest';
import { BatchCommandNoChangesError, SQL } from '../../../../core';
import { cloudflareDurableObjectSQLitePool } from '../pool';

describe('Cloudflare Durable Object SQLite batchCommand with assertChanges', () => {
  let pool: ReturnType<typeof cloudflareDurableObjectSQLitePool>;

  aroundEach(async (runTest) => {
    const stub = env.TEST_OBJECT.get(env.TEST_OBJECT.newUniqueId());

    await runInDurableObject(stub, async (_instance, state) => {
      pool = cloudflareDurableObjectSQLitePool({ storage: state.storage });

      await pool.execute.command(
        SQL`CREATE TABLE test_items (id INTEGER PRIMARY KEY, value TEXT)`,
      );
      await pool.execute.command(
        SQL`INSERT INTO test_items (id, value) VALUES (1, 'original')`,
      );
      await pool.execute.command(
        SQL`INSERT INTO test_items (id, value) VALUES (2, 'original')`,
      );

      try {
        await runTest();
      } finally {
        await pool.close();
      }
    });
  });

  it('throws BatchCommandNoChangesError when assertChanges is true and a command affects no rows', async () => {
    try {
      await pool.execute.batchCommand(
        [
          SQL`UPDATE test_items SET value = 'updated' WHERE id = 1`,
          SQL`UPDATE test_items SET value = 'updated' WHERE id = 999`,
        ],
        { assertChanges: true },
      );
      assert.fail('Expected BatchCommandNoChangesError');
    } catch (error) {
      assert.ok(error instanceof BatchCommandNoChangesError);
      assert.strictEqual(error.statementIndex, 1);
    }
  });

  it('reports the conflict with a dedicated error type distinct from a generic database failure', async () => {
    await assert.rejects(
      () =>
        pool.execute.batchCommand(
          [SQL`UPDATE test_items SET value = 'updated' WHERE id = 999`],
          { assertChanges: true },
        ),
      (error) => {
        assert.ok(error instanceof BatchCommandNoChangesError);
        assert.strictEqual(error.errorType, 'BatchCommandNoChangesError');
        assert.strictEqual(error.errorCode, 409);
        assert.strictEqual(error.statementIndex, 0);
        return true;
      },
    );
  });

  it('rolls back previous commands after assertChanges failure when storage is available', async () => {
    await assert.rejects(
      () =>
        pool.execute.batchCommand(
          [
            SQL`UPDATE test_items SET value = 'changed' WHERE id = 1`,
            SQL`UPDATE test_items SET value = 'changed' WHERE id = 999`,
          ],
          { assertChanges: true },
        ),
      BatchCommandNoChangesError,
    );

    const result = await pool.execute.query<{ value: string }>(
      SQL`SELECT value FROM test_items WHERE id = 1`,
    );
    assert.strictEqual(result.rows[0]!.value, 'original');
  });

  it('rolls back previous commands when a later SQL statement fails', async () => {
    await assert.rejects(() =>
      pool.execute.batchCommand([
        SQL`UPDATE test_items SET value = 'changed' WHERE id = 1`,
        SQL`INSERT INTO test_items (missing_column) VALUES ('invalid')`,
      ]),
    );

    const result = await pool.execute.query<{ value: string }>(
      SQL`SELECT value FROM test_items WHERE id = 1`,
    );
    assert.strictEqual(result.rows[0]!.value, 'original');
  });

  it('stops executing subsequent commands after assertChanges failure', async () => {
    await assert.rejects(
      () =>
        pool.execute.batchCommand(
          [
            SQL`UPDATE test_items SET value = 'changed' WHERE id = 999`,
            SQL`UPDATE test_items SET value = 'changed' WHERE id = 1`,
          ],
          { assertChanges: true },
        ),
      BatchCommandNoChangesError,
    );

    const result = await pool.execute.query<{ value: string }>(
      SQL`SELECT value FROM test_items WHERE id = 1`,
    );
    assert.strictEqual(result.rows[0]!.value, 'original');
  });

  it('succeeds when assertChanges is true and all commands affect rows', async () => {
    const results = await pool.execute.batchCommand(
      [
        SQL`UPDATE test_items SET value = 'updated1' WHERE id = 1`,
        SQL`UPDATE test_items SET value = 'updated2' WHERE id = 2`,
      ],
      { assertChanges: true },
    );

    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0]!.rowCount, 1);
    assert.strictEqual(results[1]!.rowCount, 1);
  });

  it('uses logical row changes for assertChanges when indexes are updated', async () => {
    await pool.execute.command(
      SQL`CREATE INDEX test_items_value_idx ON test_items (value)`,
    );

    const results = await pool.execute.batchCommand(
      [SQL`UPDATE test_items SET value = 'indexed-update' WHERE id = 1`],
      { assertChanges: true },
    );

    assert.strictEqual(results[0]!.rowCount, 1);
  });

  it('returns zero for DDL after successful DML in a batch', async () => {
    const results = await pool.execute.batchCommand([
      SQL`INSERT INTO test_items (id, value) VALUES (3, 'inserted')`,
      SQL`CREATE INDEX test_items_value_idx ON test_items (value)`,
      SQL`UPDATE test_items SET value = 'updated' WHERE id IN (1, 2)`,
    ]);

    assert.deepStrictEqual(
      results.map(({ rowCount }) => rowCount),
      [1, 0, 2],
    );
  });

  it('does not check changes when assertChanges is not set', async () => {
    const results = await pool.execute.batchCommand([
      SQL`UPDATE test_items SET value = 'updated' WHERE id = 999`,
    ]);

    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0]!.rowCount, 0);
  });
});
