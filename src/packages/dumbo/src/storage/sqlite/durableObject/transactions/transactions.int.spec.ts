import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import type { DurableObjectStorage } from '@cloudflare/workers-types';
import assert from 'assert';
import { aroundEach, describe, it } from 'vitest';
import { InvalidOperationError, SQL } from '../../../../core';
import { cloudflareDurableObjectSQLitePool } from '../pool';

const countItems = async (
  pool: ReturnType<typeof cloudflareDurableObjectSQLitePool>,
): Promise<number> => {
  const result = await pool.execute.query<{ count: number }>(
    SQL`SELECT COUNT(*) as count FROM tx_items`,
  );
  return result.rows[0]!.count;
};

describe('Cloudflare Durable Object SQLite transactions', () => {
  let pool: ReturnType<typeof cloudflareDurableObjectSQLitePool>;
  let storage: DurableObjectStorage;

  aroundEach(async (runTest) => {
    const stub = env.TEST_OBJECT.get(env.TEST_OBJECT.newUniqueId());

    await runInDurableObject(stub, async (_instance, state) => {
      storage = state.storage;
      pool = cloudflareDurableObjectSQLitePool({ storage });

      try {
        await pool.execute.command(
          SQL`CREATE TABLE tx_items (id INTEGER PRIMARY KEY, value TEXT)`,
        );
        await runTest();
      } finally {
        await pool.close();
      }
    });
  });

  it('commits writes made before and after an await', async () => {
    await pool.withTransaction(async (tx) => {
      await tx.execute.command(
        SQL`INSERT INTO tx_items (id, value) VALUES (1, 'before')`,
      );
      await Promise.resolve();
      await tx.execute.command(
        SQL`INSERT INTO tx_items (id, value) VALUES (2, 'after')`,
      );
    });

    assert.strictEqual(await countItems(pool), 2);
  });

  it('rolls back writes made before and after an await when the callback throws', async () => {
    await assert.rejects(
      () =>
        pool.withTransaction(async (tx) => {
          await tx.execute.command(
            SQL`INSERT INTO tx_items (id, value) VALUES (1, 'before')`,
          );
          await Promise.resolve();
          await tx.execute.command(
            SQL`INSERT INTO tx_items (id, value) VALUES (2, 'after')`,
          );
          throw new InvalidOperationError('rollback');
        }),
      /rollback/,
    );

    assert.strictEqual(await countItems(pool), 0);
  });

  it('returns the callback result when the transaction commits', async () => {
    const result = await pool.withTransaction(async (tx) => {
      const command = await tx.execute.command<{ id: number }>(
        SQL`INSERT INTO tx_items (id, value) VALUES (1, 'committed') RETURNING id`,
      );
      return command.rows[0]!.id;
    });

    assert.strictEqual(result, 1);
    assert.strictEqual(await countItems(pool), 1);
  });

  it('rolls back and returns the failure result when callback returns success false', async () => {
    const result = await pool.withTransaction(async (tx) => {
      await tx.execute.command(
        SQL`INSERT INTO tx_items (id, value) VALUES (1, 'rolled-back')`,
      );
      return { success: false, result: 'expected-result' };
    });

    assert.strictEqual(result, 'expected-result');
    assert.strictEqual(await countItems(pool), 0);
  });

  it('surfaces the original callback error and rolls back', async () => {
    await assert.rejects(
      () =>
        pool.withTransaction(async (tx) => {
          await tx.execute.command(
            SQL`INSERT INTO tx_items (id, value) VALUES (1, 'rolled-back')`,
          );
          throw new Error('original callback error');
        }),
      /original callback error/,
    );

    assert.strictEqual(await countItems(pool), 0);
  });

  it('commits inner and outer transactions', async () => {
    await pool.withTransaction(
      async (outer) => {
        await outer.execute.command(
          SQL`INSERT INTO tx_items (id, value) VALUES (1, 'outer')`,
        );
        await outer.withTransaction(async (inner) => {
          await inner.execute.command(
            SQL`INSERT INTO tx_items (id, value) VALUES (2, 'inner')`,
          );
        });
      },
      { allowNestedTransactions: true },
    );

    assert.strictEqual(await countItems(pool), 2);
  });

  it('commits sibling nested transactions and leaves the outer transaction usable', async () => {
    await pool.withTransaction(
      async (outer) => {
        await outer.execute.command(
          SQL`INSERT INTO tx_items (id, value) VALUES (1, 'outer-before')`,
        );

        await outer.withTransaction(async (firstInner) => {
          await Promise.resolve();
          await firstInner.execute.command(
            SQL`INSERT INTO tx_items (id, value) VALUES (2, 'first-inner')`,
          );
        });

        await Promise.resolve();

        await outer.withTransaction(async (secondInner) => {
          await secondInner.execute.command(
            SQL`INSERT INTO tx_items (id, value) VALUES (3, 'second-inner')`,
          );
          await Promise.resolve();
        });

        await outer.execute.command(
          SQL`INSERT INTO tx_items (id, value) VALUES (4, 'outer-after')`,
        );
      },
      { allowNestedTransactions: true },
    );

    const result = await pool.execute.query<{ id: number }>(
      SQL`SELECT id FROM tx_items ORDER BY id`,
    );
    assert.deepStrictEqual(result.rows, [
      { id: 1 },
      { id: 2 },
      { id: 3 },
      { id: 4 },
    ]);
  });

  it('propagates an uncaught nested transaction error and rolls back the outer transaction', async () => {
    await assert.rejects(
      () =>
        pool.withTransaction(
          async (outer) => {
            await outer.execute.command(
              SQL`INSERT INTO tx_items (id, value) VALUES (1, 'outer')`,
            );
            await Promise.resolve();

            await outer.withTransaction(async (inner) => {
              await inner.execute.command(
                SQL`INSERT INTO tx_items (id, value) VALUES (2, 'inner')`,
              );
              await Promise.resolve();
              throw new Error('uncaught inner rollback');
            });
          },
          { allowNestedTransactions: true },
        ),
      /uncaught inner rollback/,
    );

    assert.strictEqual(await countItems(pool), 0);
  });

  it('rolls back a failed inner transaction while preserving the outer transaction', async () => {
    await pool.withTransaction(
      async (outer) => {
        await outer.execute.command(
          SQL`INSERT INTO tx_items (id, value) VALUES (1, 'outer-before')`,
        );

        await assert.rejects(
          () =>
            outer.withTransaction(async (inner) => {
              await inner.execute.command(
                SQL`INSERT INTO tx_items (id, value) VALUES (2, 'inner')`,
              );
              throw new Error('inner rollback');
            }),
          /inner rollback/,
        );

        await outer.execute.command(
          SQL`INSERT INTO tx_items (id, value) VALUES (3, 'outer-after')`,
        );
      },
      { allowNestedTransactions: true },
    );

    const result = await pool.execute.query<{ id: number }>(
      SQL`SELECT id FROM tx_items ORDER BY id`,
    );
    assert.deepStrictEqual(result.rows, [{ id: 1 }, { id: 3 }]);
  });

  it('rolls back a successful inner transaction when the outer transaction fails', async () => {
    await assert.rejects(
      () =>
        pool.withTransaction(
          async (outer) => {
            await outer.execute.command(
              SQL`INSERT INTO tx_items (id, value) VALUES (1, 'outer')`,
            );
            await outer.withTransaction(async (inner) => {
              await inner.execute.command(
                SQL`INSERT INTO tx_items (id, value) VALUES (2, 'inner')`,
              );
            });
            throw new Error('outer rollback');
          },
          { allowNestedTransactions: true },
        ),
      /outer rollback/,
    );

    assert.strictEqual(await countItems(pool), 0);
  });

  it('rejects nested transactions by default', async () => {
    await pool.withTransaction(async (outer) => {
      await assert.rejects(
        () => outer.withTransaction(() => Promise.resolve()),
        (error) => {
          assert.ok(error instanceof InvalidOperationError);
          assert.strictEqual(
            error.message,
            'Cannot start a nested transaction: allowNestedTransactions is false. Set transactionOptions: { allowNestedTransactions: true } on your pool or connection.',
          );
          return true;
        },
      );
    });
  });

  it('rejects a nested transaction when the nested call explicitly disables it', async () => {
    await pool.withTransaction(
      async (outer) => {
        await assert.rejects(
          () =>
            outer.withTransaction(() => Promise.resolve(), {
              allowNestedTransactions: false,
            }),
          /Cannot start a nested transaction: allowNestedTransactions is false/,
        );
      },
      { allowNestedTransactions: true },
    );
  });

  it('rejects re-entering a transaction through the same pool by default', async () => {
    await pool.withTransaction(async (outer) => {
      await outer.execute.command(
        SQL`INSERT INTO tx_items (id, value) VALUES (1, 'outer')`,
      );

      await assert.rejects(
        () => pool.withTransaction(() => Promise.resolve()),
        /Cannot start a nested transaction: allowNestedTransactions is false/,
      );
    });

    assert.strictEqual(await countItems(pool), 1);
  });

  it('supports nested transactions enabled by pool defaults', async () => {
    const pool = cloudflareDurableObjectSQLitePool({
      storage,
      transactionOptions: { allowNestedTransactions: true },
    });

    try {
      await pool.withTransaction(async (outer) => {
        await outer.execute.command(
          SQL`INSERT INTO tx_items (id, value) VALUES (1, 'outer')`,
        );
        await outer.withTransaction(async (inner) => {
          await inner.execute.command(
            SQL`INSERT INTO tx_items (id, value) VALUES (2, 'inner')`,
          );
        });
      });

      assert.strictEqual(await countItems(pool), 2);
    } finally {
      await pool.close();
    }
  });

  it('supports same-pool reentry enabled by pool defaults', async () => {
    const pool = cloudflareDurableObjectSQLitePool({
      storage,
      transactionOptions: { allowNestedTransactions: true },
    });

    try {
      await pool.withTransaction(async (outer) => {
        await outer.execute.command(
          SQL`INSERT INTO tx_items (id, value) VALUES (1, 'outer')`,
        );
        await pool.withTransaction(async (inner) => {
          await inner.execute.command(
            SQL`INSERT INTO tx_items (id, value) VALUES (2, 'inner')`,
          );
        });
      });

      assert.strictEqual(await countItems(pool), 2);
    } finally {
      await pool.close();
    }
  });

  it('rolls back only an opted-in nested transaction that returns success false', async () => {
    await pool.withTransaction(
      async (outer) => {
        await outer.execute.command(
          SQL`INSERT INTO tx_items (id, value) VALUES (1, 'outer-before')`,
        );

        const innerResult = await outer.withTransaction(async (inner) => {
          await inner.execute.command(
            SQL`INSERT INTO tx_items (id, value) VALUES (2, 'inner')`,
          );
          return { success: false, result: 'inner-result' };
        });
        assert.strictEqual(innerResult, 'inner-result');

        await outer.execute.command(
          SQL`INSERT INTO tx_items (id, value) VALUES (3, 'outer-after')`,
        );
      },
      { allowNestedTransactions: true },
    );

    const result = await pool.execute.query<{ id: number }>(
      SQL`SELECT id FROM tx_items ORDER BY id`,
    );
    assert.deepStrictEqual(result.rows, [{ id: 1 }, { id: 3 }]);
  });

  it('serializes independent concurrent transactions', async () => {
    const firstEntered = Promise.withResolvers<void>();
    const releaseFirst = Promise.withResolvers<void>();
    const entered: string[] = [];

    const first = pool.withTransaction(async (tx) => {
      entered.push('first');
      firstEntered.resolve();
      await tx.execute.command(
        SQL`INSERT INTO tx_items (id, value) VALUES (1, 'first')`,
      );
      await releaseFirst.promise;
    });

    await firstEntered.promise;

    const second = pool.withTransaction(async (tx) => {
      entered.push('second');
      await tx.execute.command(
        SQL`INSERT INTO tx_items (id, value) VALUES (2, 'second')`,
      );
    });

    await Promise.resolve();
    assert.deepStrictEqual(entered, ['first']);

    releaseFirst.resolve();
    await Promise.all([first, second]);

    assert.deepStrictEqual(entered, ['first', 'second']);
    assert.strictEqual(await countItems(pool), 2);
  });

  it('does not invoke a queued transaction callback after it is aborted', async () => {
    const firstEntered = Promise.withResolvers<void>();
    const releaseFirst = Promise.withResolvers<void>();
    const controller = new AbortController();
    const abortReason = new InvalidOperationError(
      'queued transaction aborted before begin',
    );
    let callbackCalled = false;

    const first = pool.withTransaction(async () => {
      firstEntered.resolve();
      await releaseFirst.promise;
    });
    await firstEntered.promise;

    const second = pool.withTransaction(
      () => {
        callbackCalled = true;
        return Promise.resolve();
      },
      { abort: { signal: controller.signal } },
    );
    const secondRejected = assert.rejects(
      second,
      (error) => error === abortReason,
    );
    await Promise.resolve();
    controller.abort(abortReason);
    releaseFirst.resolve();

    await Promise.all([first, secondRejected]);
    assert.strictEqual(callbackCalled, false);
  });

  it('keeps a root-pool write inside the active transaction callback', async () => {
    await assert.rejects(
      () =>
        pool.withTransaction(async (tx) => {
          await tx.execute.command(
            SQL`INSERT INTO tx_items (id, value) VALUES (1, 'tx-row')`,
          );
          await Promise.resolve();
          await pool.execute.command(
            SQL`INSERT INTO tx_items (id, value) VALUES (2, 'plain-row')`,
          );
          throw new Error('tx intentional rollback');
        }),
      /tx intentional rollback/,
    );

    const rows = await pool.execute.query<{ id: number; value: string }>(
      SQL`SELECT id, value FROM tx_items ORDER BY id`,
    );
    assert.deepStrictEqual(rows.rows, []);
  });

  it('includes a root-pool write started while a transaction callback is pending', async () => {
    const transactionEntered = Promise.withResolvers<void>();
    const releaseTransaction = Promise.withResolvers<void>();

    const transaction = pool.withTransaction(async (tx) => {
      await tx.execute.command(
        SQL`INSERT INTO tx_items (id, value) VALUES (1, 'tx-row')`,
      );
      transactionEntered.resolve();
      await releaseTransaction.promise;
      throw new Error('tx intentional rollback');
    });

    await transactionEntered.promise;

    const plainWrite = pool.execute.command(
      SQL`INSERT INTO tx_items (id, value) VALUES (2, 'plain-row')`,
    );

    releaseTransaction.resolve();

    await assert.rejects(transaction, /tx intentional rollback/);
    await plainWrite;

    // Unlike sqlite3's queued pool operations, workerd includes every call on
    // the same storage while storage.transaction() is pending.
    const rows = await pool.execute.query<{ id: number; value: string }>(
      SQL`SELECT id, value FROM tx_items ORDER BY id`,
    );
    assert.deepStrictEqual(rows.rows, []);
  });

  it('isolates a failing concurrent transaction from a successful one', async () => {
    const successful = pool.withTransaction(async (tx) => {
      await tx.execute.command(
        SQL`INSERT INTO tx_items (id, value) VALUES (1, 'committed')`,
      );
    });
    const failing = pool.withTransaction(async (tx) => {
      await tx.execute.command(
        SQL`INSERT INTO tx_items (id, value) VALUES (2, 'rolled-back')`,
      );
      throw new Error('intentional concurrent failure');
    });

    const results = await Promise.allSettled([successful, failing]);

    assert.strictEqual(results[0]?.status, 'fulfilled');
    const failedResult = results[1];
    assert.ok(failedResult?.status === 'rejected');
    assert.ok(failedResult.reason instanceof Error);
    assert.match(failedResult.reason.message, /intentional concurrent failure/);

    const rows = await pool.execute.query<{ id: number; value: string }>(
      SQL`SELECT id, value FROM tx_items ORDER BY id`,
    );
    assert.deepStrictEqual(rows.rows, [{ id: 1, value: 'committed' }]);
  });

  it('allows pool.withConnection reentry inside pool.withTransaction', async () => {
    await pool.withTransaction(async (tx) => {
      await tx.execute.command(
        SQL`INSERT INTO tx_items (id, value) VALUES (1, 'outer')`,
      );
      await pool.withConnection(async (connection) => {
        await connection.execute.command(
          SQL`INSERT INTO tx_items (id, value) VALUES (2, 'inner')`,
        );
      });
    });

    assert.strictEqual(await countItems(pool), 2);
  });

  it('allows pool.execute.command reentry inside pool.withTransaction', async () => {
    await pool.withTransaction(async (tx) => {
      await tx.execute.command(
        SQL`INSERT INTO tx_items (id, value) VALUES (1, 'outer')`,
      );
      await pool.execute.command(
        SQL`INSERT INTO tx_items (id, value) VALUES (2, 'inner')`,
      );
    });

    assert.strictEqual(await countItems(pool), 2);
  });

  it('allows nested pool.withConnection inside connection.withTransaction', async () => {
    const pool = cloudflareDurableObjectSQLitePool({
      storage,
      transactionOptions: { allowNestedTransactions: true },
    });

    try {
      await pool.withConnection(async (outerConnection) => {
        await outerConnection.withTransaction(async (outerTransaction) => {
          await outerTransaction.execute.command(
            SQL`INSERT INTO tx_items (id, value) VALUES (1, 'outer')`,
          );
          await pool.withConnection(async (innerConnection) => {
            await innerConnection.withTransaction(async (innerTransaction) => {
              await innerTransaction.execute.command(
                SQL`INSERT INTO tx_items (id, value) VALUES (2, 'inner')`,
              );
            });
          });
        });
      });

      assert.strictEqual(await countItems(pool), 2);
    } finally {
      await pool.close();
    }
  });

  it('serializes concurrent withConnection writes', async () => {
    const writes = Array.from({ length: 20 }, (_, index) =>
      pool.withConnection(async (connection) => {
        await connection.withTransaction(async () => {
          await connection.execute.command(
            SQL`INSERT INTO tx_items (id, value) VALUES (${index + 1}, ${`value-${index + 1}`})`,
          );
        });
      }),
    );

    await Promise.all(writes);

    assert.strictEqual(await countItems(pool), 20);
  });

  it('does not start a transaction when the operation is already aborted', async () => {
    const controller = new AbortController();
    const abortReason = new InvalidOperationError('transaction aborted');
    controller.abort(abortReason);
    let callbackCalled = false;

    await assert.rejects(
      () =>
        pool.withTransaction(
          () => {
            callbackCalled = true;
            return Promise.resolve();
          },
          { abort: { signal: controller.signal } },
        ),
      (error) => error === abortReason,
    );

    assert.strictEqual(callbackCalled, false);
    assert.strictEqual(await countItems(pool), 0);
  });

  it('rolls back when aborted during a callback that ignores its context', async () => {
    const controller = new AbortController();
    const abortReason = new InvalidOperationError(
      'transaction aborted during callback',
    );

    await assert.rejects(
      () =>
        pool.withTransaction(
          async (transaction) => {
            await transaction.execute.command(
              SQL`INSERT INTO tx_items (id, value) VALUES (1, 'aborted')`,
            );
            controller.abort(abortReason);
          },
          { abort: { signal: controller.signal } },
        ),
      (error) => error === abortReason,
    );

    assert.strictEqual(await countItems(pool), 0);
  });

  it('honors an already-aborted default transaction option', async () => {
    const controller = new AbortController();
    const abortReason = new InvalidOperationError(
      'default transaction aborted',
    );
    controller.abort(abortReason);
    const pool = cloudflareDurableObjectSQLitePool({
      storage,
      transactionOptions: { abort: { signal: controller.signal } },
    });
    let callbackCalled = false;

    try {
      await assert.rejects(
        () =>
          pool.withTransaction(() => {
            callbackCalled = true;
            return Promise.resolve();
          }),
        (error) => error === abortReason,
      );

      assert.strictEqual(callbackCalled, false);
    } finally {
      await pool.close();
    }
  });

  it('commits a lifecycle transaction across await boundaries', async () => {
    const transaction = pool.transaction();

    await transaction.begin();
    await transaction.execute.command(
      SQL`INSERT INTO tx_items (id, value) VALUES (1, 'before')`,
    );
    await Promise.resolve();
    await transaction.execute.command(
      SQL`INSERT INTO tx_items (id, value) VALUES (2, 'after')`,
    );

    await transaction.commit();

    assert.strictEqual(await countItems(pool), 2);
    await assert.rejects(
      () => transaction.execute.query(SQL`SELECT 1`),
      /Transaction has already completed/,
    );
  });

  it('rolls back an explicit transaction aborted before commit', async () => {
    const controller = new AbortController();
    const abortReason = new InvalidOperationError(
      'transaction aborted before commit',
    );
    const transaction = pool.transaction({
      abort: { signal: controller.signal },
    });

    await transaction.begin();
    await transaction.execute.command(
      SQL`INSERT INTO tx_items (id, value) VALUES (1, 'aborted')`,
    );
    controller.abort(abortReason);

    await assert.rejects(
      () => transaction.commit(),
      (error) => error === abortReason,
    );
    assert.strictEqual(await countItems(pool), 0);
  });

  it('commits a root-pool operation in the same lifecycle transaction flow', async () => {
    const transaction = pool.transaction();

    await transaction.begin();
    await transaction.execute.command(
      SQL`INSERT INTO tx_items (id, value) VALUES (1, 'transaction')`,
    );
    await Promise.resolve();
    await pool.execute.command(
      SQL`INSERT INTO tx_items (id, value) VALUES (2, 'root-pool')`,
    );
    await Promise.resolve();
    await transaction.commit();

    const result = await pool.execute.query<{ id: number }>(
      SQL`SELECT id FROM tx_items ORDER BY id`,
    );
    assert.deepStrictEqual(result.rows, [{ id: 1 }, { id: 2 }]);
  });

  it('rolls back a lifecycle transaction across await boundaries', async () => {
    const transaction = pool.transaction();

    await transaction.begin();
    await transaction.execute.command(
      SQL`INSERT INTO tx_items (id, value) VALUES (1, 'before')`,
    );
    await Promise.resolve();
    await transaction.execute.command(
      SQL`INSERT INTO tx_items (id, value) VALUES (2, 'after')`,
    );

    await transaction.rollback();

    assert.strictEqual(await countItems(pool), 0);
    await assert.rejects(
      () => transaction.execute.query(SQL`SELECT 1`),
      /Transaction has already completed/,
    );
  });

  it('enlists and rolls back a root-pool operation started from another promise chain while a lifecycle transaction is pending', async () => {
    const transaction = pool.transaction();

    await transaction.begin();
    await transaction.execute.command(
      SQL`INSERT INTO tx_items (id, value) VALUES (1, 'transaction')`,
    );

    const rootWrite = Promise.resolve().then(async () => {
      await Promise.resolve();
      await pool.execute.command(
        SQL`INSERT INTO tx_items (id, value) VALUES (2, 'root-pool')`,
      );
    });

    await rootWrite;
    await Promise.resolve();
    await transaction.rollback();

    assert.strictEqual(await countItems(pool), 0);
  });

  it('serializes concurrent explicit lifecycle transactions', async () => {
    const first = pool.transaction();
    const second = pool.transaction();

    await first.begin();
    await first.execute.command(
      SQL`INSERT INTO tx_items (id, value) VALUES (1, 'first')`,
    );

    const secondWork = second.begin().then(async () => {
      await second.execute.command(
        SQL`INSERT INTO tx_items (id, value) VALUES (2, 'second')`,
      );
      await second.commit();
    });

    await Promise.resolve();
    await first.commit();
    await secondWork;

    const result = await pool.execute.query<{ id: number }>(
      SQL`SELECT id FROM tx_items ORDER BY id`,
    );
    assert.deepStrictEqual(result.rows, [{ id: 1 }, { id: 2 }]);
  });

  it('isolates a rolled-back lifecycle transaction from a queued lifecycle transaction', async () => {
    const first = pool.transaction();
    const second = pool.transaction();

    await first.begin();
    await first.execute.command(
      SQL`INSERT INTO tx_items (id, value) VALUES (1, 'rolled-back')`,
    );

    const secondWork = second.begin().then(async () => {
      await second.execute.command(
        SQL`INSERT INTO tx_items (id, value) VALUES (2, 'committed')`,
      );
      await second.commit();
    });

    await Promise.resolve();
    await first.rollback(new Error('first lifecycle rollback'));
    await secondWork;

    const result = await pool.execute.query<{ id: number; value: string }>(
      SQL`SELECT id, value FROM tx_items ORDER BY id`,
    );
    assert.deepStrictEqual(result.rows, [{ id: 2, value: 'committed' }]);
  });

  it('uses the original rollback error without replacing it', async () => {
    const transaction = pool.transaction();
    const original = new Error('original lifecycle error');

    await transaction.begin();
    await transaction.execute.command(
      SQL`INSERT INTO tx_items (id, value) VALUES (1, 'rolled-back')`,
    );

    await assert.doesNotReject(() => transaction.rollback(original));
    assert.strictEqual(await countItems(pool), 0);
  });

  it('rejects execution and completion before begin', async () => {
    const transaction = pool.transaction();

    await assert.rejects(
      () => transaction.execute.query(SQL`SELECT 1`),
      (error) => {
        assert.ok(error instanceof InvalidOperationError);
        assert.strictEqual(
          error.message,
          'Transaction has not been started. Call begin() first.',
        );
        return true;
      },
    );
    await assert.rejects(
      () => transaction.commit(),
      /Cannot commit a transaction that has not been started/,
    );
    await assert.rejects(
      () => transaction.rollback(),
      /Cannot roll back a transaction that has not been started/,
    );
  });

  it('rejects invalid lifecycle ordering without hanging', async () => {
    const transaction = pool.transaction();

    await transaction.begin();
    await assert.rejects(
      () => transaction.begin(),
      /Cannot start a nested transaction: allowNestedTransactions is false/,
    );
    await transaction.commit();

    await assert.rejects(
      () => transaction.begin(),
      /Cannot begin a transaction that has already completed/,
    );
    await assert.rejects(
      () => transaction.commit(),
      /Cannot commit a transaction that has already completed/,
    );
    await assert.rejects(
      () => transaction.rollback(),
      /Cannot roll back a transaction that has already completed/,
    );
    await assert.rejects(
      () => transaction.withTransaction(() => Promise.resolve()),
      InvalidOperationError,
    );
  });

  it('rejects begin when aborted after creating an explicit transaction', async () => {
    const controller = new AbortController();
    const abortReason = new InvalidOperationError('lifecycle aborted');
    const pool = cloudflareDurableObjectSQLitePool({ storage });

    try {
      const transaction = pool.transaction({
        abort: { signal: controller.signal },
      });
      controller.abort(abortReason);

      await assert.rejects(
        () => transaction.begin(),
        (error) => {
          assert.strictEqual(error, abortReason);
          return true;
        },
      );

      const nextTransaction = pool.transaction();
      await nextTransaction.begin();
      await nextTransaction.rollback();
      assert.strictEqual(await countItems(pool), 0);
    } finally {
      await pool.close();
    }
  });

  it('defers a nested lifecycle commit until the outer commit when enabled', async () => {
    const pool = cloudflareDurableObjectSQLitePool({
      storage,
      transactionOptions: { allowNestedTransactions: true },
    });

    try {
      const transaction = pool.transaction();

      await transaction.begin();
      await transaction.execute.command(
        SQL`INSERT INTO tx_items (id, value) VALUES (1, 'outer')`,
      );
      await transaction.begin();
      await transaction.execute.command(
        SQL`INSERT INTO tx_items (id, value) VALUES (2, 'inner')`,
      );

      await transaction.commit();
      await transaction.execute.command(
        SQL`INSERT INTO tx_items (id, value) VALUES (3, 'outer-after')`,
      );
      await transaction.commit();

      assert.strictEqual(await countItems(pool), 3);
    } finally {
      await pool.close();
    }
  });

  it('treats a nested lifecycle rollback as a no-op without savepoints', async () => {
    const pool = cloudflareDurableObjectSQLitePool({
      storage,
      transactionOptions: { allowNestedTransactions: true },
    });

    try {
      const transaction = pool.transaction();

      await transaction.begin();
      await transaction.execute.command(
        SQL`INSERT INTO tx_items (id, value) VALUES (1, 'outer')`,
      );
      await transaction.begin();
      await transaction.execute.command(
        SQL`INSERT INTO tx_items (id, value) VALUES (2, 'inner')`,
      );

      await transaction.rollback(new Error('nested rollback'));
      await transaction.execute.command(
        SQL`INSERT INTO tx_items (id, value) VALUES (3, 'outer-after')`,
      );
      await transaction.commit();

      const result = await pool.execute.query<{ id: number }>(
        SQL`SELECT id FROM tx_items ORDER BY id`,
      );
      assert.deepStrictEqual(result.rows, [{ id: 1 }, { id: 2 }, { id: 3 }]);
    } finally {
      await pool.close();
    }
  });
});

describe('Cloudflare Durable Object SQLite raw runtime transactions', () => {
  let pool: ReturnType<typeof cloudflareDurableObjectSQLitePool>;
  let storage: DurableObjectStorage;

  aroundEach(async (runTest) => {
    const stub = env.TEST_OBJECT.get(env.TEST_OBJECT.newUniqueId());

    await runInDurableObject(stub, async (_instance, state) => {
      storage = state.storage;
      pool = cloudflareDurableObjectSQLitePool({ storage });

      try {
        await pool.execute.command(
          SQL`CREATE TABLE tx_items (id INTEGER PRIMARY KEY, value TEXT)`,
        );
        await runTest();
      } finally {
        await pool.close();
      }
    });
  });

  it('includes caller SQL in a pending transaction callback', async () => {
    const transactionEntered = Promise.withResolvers<void>();
    const finishTransaction = Promise.withResolvers<void>();
    const transaction = storage.transaction(async () => {
      transactionEntered.resolve();
      await finishTransaction.promise;
      throw new Error('rollback pending transaction');
    });

    await transactionEntered.promise;
    storage.sql.exec(
      "INSERT INTO tx_items (id, value) VALUES (1, 'outside-callback')",
    );
    finishTransaction.resolve();

    await assert.rejects(transaction, /rollback pending transaction/);
    assert.strictEqual(await countItems(pool), 0);
  });

  it('commits nested storage transactions', async () => {
    await storage.transaction(async () => {
      storage.sql.exec("INSERT INTO tx_items (id, value) VALUES (1, 'outer')");
      await storage.transaction(async () => {
        storage.sql.exec(
          "INSERT INTO tx_items (id, value) VALUES (2, 'inner')",
        );
        await Promise.resolve();
      });
    });

    assert.strictEqual(await countItems(pool), 2);
  });

  it('rolls back a failed nested storage transaction without rolling back its caller', async () => {
    await storage.transaction(async () => {
      storage.sql.exec(
        "INSERT INTO tx_items (id, value) VALUES (1, 'outer-before')",
      );
      await assert.rejects(
        () =>
          storage.transaction(async () => {
            storage.sql.exec(
              "INSERT INTO tx_items (id, value) VALUES (2, 'inner')",
            );
            await Promise.resolve();
            throw new Error('inner rollback');
          }),
        /inner rollback/,
      );
      storage.sql.exec(
        "INSERT INTO tx_items (id, value) VALUES (3, 'outer-after')",
      );
    });

    const result = await pool.execute.query<{ id: number }>(
      SQL`SELECT id FROM tx_items ORDER BY id`,
    );
    assert.deepStrictEqual(result.rows, [{ id: 1 }, { id: 3 }]);
  });

  it('rolls back a nested storage transaction when its caller rolls back', async () => {
    await assert.rejects(
      () =>
        storage.transaction(async () => {
          storage.sql.exec(
            "INSERT INTO tx_items (id, value) VALUES (1, 'outer')",
          );
          await storage.transaction(async () => {
            storage.sql.exec(
              "INSERT INTO tx_items (id, value) VALUES (2, 'inner')",
            );
            await Promise.resolve();
          });
          throw new Error('outer rollback');
        }),
      /outer rollback/,
    );

    assert.strictEqual(await countItems(pool), 0);
  });

  it('rolls back SqlStorage writes before and after await when storage.transaction throws', async () => {
    await assert.rejects(
      () =>
        storage.transaction(async () => {
          storage.sql.exec(
            "INSERT INTO tx_items (id, value) VALUES (1, 'before')",
          );
          await Promise.resolve();
          storage.sql.exec(
            "INSERT INTO tx_items (id, value) VALUES (2, 'after')",
          );
          throw new Error('rollback');
        }),
      /rollback/,
    );

    assert.strictEqual(await countItems(pool), 0);
  });

  it('commits SqlStorage writes before and after await when storage.transaction resolves', async () => {
    await storage.transaction(async () => {
      storage.sql.exec("INSERT INTO tx_items (id, value) VALUES (1, 'before')");
      await Promise.resolve();
      storage.sql.exec("INSERT INTO tx_items (id, value) VALUES (2, 'after')");
    });

    assert.strictEqual(await countItems(pool), 2);
  });
});
