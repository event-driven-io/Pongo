import type { D1Database } from '@cloudflare/workers-types';
import assert from 'assert';
import { Miniflare } from 'miniflare';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { d1Pool } from '..';
import { SQL } from '../../../../core';

describe('D1 Transactions', () => {
  let mf: Miniflare;
  let database: D1Database;

  beforeEach(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: { DB: 'test-db-id' },
    });
    database = await mf.getD1Database('DB');
  });

  afterEach(async () => {
    await mf.dispose();
  });

  describe(`transactions with database`, () => {
    it('throws D1TransactionNotSupportedError when mode is not specified', async () => {
      const pool = d1Pool({
        database,
        transactionOptions: { allowNestedTransactions: true },
      });
      const connection = await pool.connection();

      try {
        await connection.execute.query(
          SQL`CREATE TABLE test_table (id INTEGER, value TEXT)`,
        );

        await assert.rejects(
          () =>
            connection.withTransaction(async () => {
              await connection.execute.query(
                SQL`INSERT INTO test_table (id, value) VALUES (1, "test")`,
              );
            }),
          {
            name: 'D1TransactionNotSupportedError',
          },
        );
      } finally {
        await connection.close();
        await pool.close();
      }
    });

    it('throws D1TransactionNotSupportedError when mode is strict', async () => {
      const pool = d1Pool({
        database,
        transactionOptions: {
          allowNestedTransactions: true,
          mode: 'strict',
        },
      });
      const connection = await pool.connection();

      try {
        await connection.execute.query(
          SQL`CREATE TABLE test_table (id INTEGER, value TEXT)`,
        );

        await assert.rejects(
          () =>
            connection.withTransaction(
              async () => {
                await connection.execute.query(
                  SQL`INSERT INTO test_table (id, value) VALUES (1, "test")`,
                );
              },
              { mode: 'strict' },
            ),
          {
            name: 'D1TransactionNotSupportedError',
          },
        );
      } finally {
        await connection.close();
        await pool.close();
      }
    });

    it('starts a session transaction after a strict transaction fails to begin', async () => {
      const pool = d1Pool({
        database,
        transactionOptions: { mode: 'strict' },
      });
      const connection = await pool.connection();

      try {
        await connection.execute.command(
          SQL`CREATE TABLE test_table (id INTEGER, value TEXT)`,
        );

        await assert.rejects(
          () => connection.withTransaction(() => Promise.resolve()),
          { name: 'D1TransactionNotSupportedError' },
        );

        await connection.withTransaction(
          async (transaction) => {
            await transaction.execute.command(
              SQL`INSERT INTO test_table (id, value) VALUES (1, 'recovered')`,
            );
          },
          { mode: 'session_based' },
        );

        const result = await connection.execute.query<{ count: number }>(
          SQL`SELECT COUNT(*) AS count FROM test_table`,
        );
        assert.strictEqual(result.rows[0]?.count, 1);
      } finally {
        await connection.close();
        await pool.close();
      }
    });

    it('honors an already-aborted default transaction option', async () => {
      const controller = new AbortController();
      const abortReason = new Error('default D1 transaction aborted');
      controller.abort(abortReason);
      const pool = d1Pool({
        database,
        transactionOptions: {
          abort: { signal: controller.signal },
          mode: 'session_based',
        },
      });
      const connection = await pool.connection();
      let callbackCalled = false;

      try {
        await assert.rejects(
          () =>
            connection.withTransaction(() => {
              callbackCalled = true;
              return Promise.resolve();
            }),
          (error) => error === abortReason,
        );
        assert.strictEqual(callbackCalled, false);
      } finally {
        await connection.close();
        await pool.close();
      }
    });

    it('rejects begin when aborted after creating an explicit transaction', async () => {
      const controller = new AbortController();
      const abortReason = new Error('D1 transaction aborted before begin');
      const pool = d1Pool({ database });
      const connection = await pool.connection();

      try {
        const transaction = connection.transaction({
          abort: { signal: controller.signal },
          mode: 'session_based',
        });
        controller.abort(abortReason);

        await assert.rejects(
          () => transaction.begin(),
          (error) => error === abortReason,
        );

        await connection.withTransaction(() => Promise.resolve(), {
          mode: 'session_based',
        });
      } finally {
        await connection.close();
        await pool.close();
      }
    });

    it('rejects when aborted during a callback that ignores its context', async () => {
      const controller = new AbortController();
      const abortReason = new Error('D1 transaction aborted during callback');
      const pool = d1Pool({
        database,
        transactionOptions: { mode: 'session_based' },
      });
      const connection = await pool.connection();

      try {
        await assert.rejects(
          () =>
            connection.withTransaction(
              () => {
                controller.abort(abortReason);
                return Promise.resolve();
              },
              { abort: { signal: controller.signal } },
            ),
          (error) => error === abortReason,
        );

        await connection.withTransaction(() => Promise.resolve());
      } finally {
        await connection.close();
        await pool.close();
      }
    });

    it('allows transaction when mode is session_based', async () => {
      const pool = d1Pool({
        database,
        transactionOptions: {
          allowNestedTransactions: true,
          mode: 'session_based',
        },
      });
      const connection = await pool.connection();

      try {
        await connection.execute.query(
          SQL`CREATE TABLE test_table (id INTEGER, value TEXT)`,
        );

        const result = await connection.withTransaction<number>(
          async () => {
            const result = await connection.execute.query(
              SQL`INSERT INTO test_table (id, value) VALUES (1, "test") RETURNING id`,
            );
            return (result.rows[0]?.id as number) ?? null;
          },
          { mode: 'session_based' },
        );

        assert.strictEqual(result, 1);
      } finally {
        await connection.close();
        await pool.close();
      }
    });

    it('commits a nested transaction with pool', async () => {
      const pool = d1Pool({
        database,
        transactionOptions: {
          allowNestedTransactions: true,
          mode: 'session_based',
        },
      });
      const connection = await pool.connection();

      try {
        await connection.execute.query(
          SQL`CREATE TABLE test_table (id INTEGER, value TEXT)`,
        );

        const result = await connection.withTransaction<number>(
          async () => {
            await connection.execute.query(
              SQL`INSERT INTO test_table (id, value) VALUES (2, "test") RETURNING id`,
            );

            const result = await connection.withTransaction<number>(
              async () => {
                const result = await connection.execute.query(
                  SQL`INSERT INTO test_table (id, value) VALUES (1, "test") RETURNING id`,
                );
                return (result.rows[0]?.id as number) ?? null;
              },
            );

            return result;
          },
          { mode: 'session_based' },
        );

        assert.strictEqual(result, 1);

        const rows = await connection.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_table`,
        );

        assert.strictEqual(rows.rows[0]?.count, 2);
      } finally {
        await connection.close();
        await pool.close();
      }
    });
    it('should fail with an error if transaction nested is false', async () => {
      const pool = d1Pool({
        database,
        transactionOptions: {
          allowNestedTransactions: false,
          mode: 'session_based',
        },
      });
      const connection = await pool.connection();

      try {
        await connection.execute.query(
          SQL`CREATE TABLE test_table (id INTEGER, value TEXT)`,
        );

        await connection.withTransaction<number>(
          async () => {
            await connection.execute.query(
              SQL`INSERT INTO test_table (id, value) VALUES (2, "test") RETURNING id`,
            );

            const result = await connection.withTransaction<number>(
              async () => {
                const result = await connection.execute.query(
                  SQL`INSERT INTO test_table (id, value) VALUES (1, "test") RETURNING id`,
                );
                return (result.rows[0]?.id as number) ?? null;
              },
            );

            return result;
          },
          { mode: 'session_based' },
        );
      } catch (error) {
        assert.strictEqual(
          (error as Error).message,
          'SQLITE_ERROR: cannot start a transaction within a transaction',
        );
      } finally {
        await connection.close();
        await pool.close();
      }
    });

    it('should try catch and NOT roll back everything when the inner transaction errors for a pooled connection', async () => {
      const pool = d1Pool({
        database,
        transactionOptions: {
          allowNestedTransactions: true,
          mode: 'session_based',
        },
      });
      const connection = await pool.connection();
      const connection2 = await pool.connection();

      try {
        await connection.execute.query(
          SQL`CREATE TABLE test_table (id INTEGER, value TEXT)`,
        );

        try {
          await connection.withTransaction(
            async () => {
              await connection.execute.query(
                SQL`INSERT INTO test_table (id, value) VALUES (2, "test") RETURNING id`,
              );

              await connection2.withTransaction<number>(
                () => {
                  throw new Error('Intentionally throwing');
                },
                { mode: 'session_based' },
              );
            },
            { mode: 'session_based' },
          );
        } catch (error) {
          assert.strictEqual(
            (error as Error).message,
            'Intentionally throwing',
          );
        }
        const rows = await connection.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_table`,
        );

        // Note:
        // D1 transactions are not rolling back, as they are not supported
        // You need to use batch to have atomic operations
        assert.strictEqual(rows.rows[0]?.count, 1);
      } finally {
        await connection.close();
        await pool.close();
      }
    });

    it('should try catch and NOT roll back everything when the outer transactions errors for a pooled connection', async () => {
      const pool = d1Pool({
        database,
        transactionOptions: {
          allowNestedTransactions: true,
          mode: 'session_based',
        },
      });
      const connection = await pool.connection();
      const connection2 = await pool.connection();

      try {
        await connection.execute.query(
          SQL`CREATE TABLE test_table (id INTEGER, value TEXT);`,
        );
        await connection2.execute.query(
          SQL`CREATE TABLE test_table_s (id INTEGER, value TEXT);`,
        );

        try {
          await connection.withTransaction<{
            id: null | string;
          }>(
            async () => {
              await connection.execute.query(
                SQL`INSERT INTO test_table (id, value) VALUES (1, "test") RETURNING id`,
              );

              await connection2.withTransaction<number>(
                async () => {
                  const result = await connection2.execute.query(
                    SQL`INSERT INTO test_table_s (id, value) VALUES (2, "test") RETURNING id`,
                  );
                  return (result.rows[0]?.id as number) ?? null;
                },
                { mode: 'session_based' },
              );

              throw new Error('Intentionally throwing');
            },
            { mode: 'session_based' },
          );
        } catch (error) {
          // make sure the error is the correct one. catch but let it continue so it doesn't trigger
          // the outer errors
          assert.strictEqual(
            (error as Error).message,
            'Intentionally throwing',
          );
        }
        const rows = await connection.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_table`,
        );

        // Note:
        // D1 transactions are not rolling back, as they are not supported
        // You need to use batch to have atomic operations
        assert.strictEqual(rows.rows[0]?.count, 1);
      } finally {
        await connection.close();
        await pool.close();
      }
    });

    it('commits a nested transaction with singleton pool', async () => {
      const pool = d1Pool({
        database,
        transactionOptions: {
          allowNestedTransactions: true,
          mode: 'session_based',
        },
      });
      const connection = await pool.connection();
      const connection2 = await pool.connection();

      try {
        await connection.execute.query(
          SQL`CREATE TABLE test_table (id INTEGER, value TEXT)`,
        );

        const result = await connection.withTransaction<number | null>(
          async () => {
            await connection.execute.query(
              SQL`INSERT INTO test_table (id, value) VALUES (2, "test") RETURNING id`,
            );

            const result = await connection2.withTransaction<number | null>(
              async () => {
                const result = await connection2.execute.query(
                  SQL`INSERT INTO test_table (id, value) VALUES (1, "test") RETURNING id`,
                );
                return (result.rows[0]?.id as number) ?? null;
              },
              { mode: 'session_based' },
            );

            return result;
          },
          { mode: 'session_based' },
        );

        assert.strictEqual(result, 1);

        const rows = await connection.execute.query<{ count: number }>(
          SQL`SELECT COUNT(*) as count FROM test_table`,
        );

        assert.strictEqual(rows.rows[0]?.count, 2);
      } finally {
        await connection.close();
        await pool.close();
      }
    });

    it('transactions errors inside the nested inner transaction for a singleton should try catch and NOT roll back everything', async () => {
      const pool = d1Pool({
        database,
        transactionOptions: {
          allowNestedTransactions: true,
          mode: 'session_based',
        },
      });
      const connection = await pool.connection();
      const connection2 = await pool.connection();

      try {
        await connection.execute.query(
          SQL`CREATE TABLE test_table (id INTEGER, value TEXT)`,
        );

        try {
          await connection.withTransaction<{
            id: null | string;
          }>(
            async () => {
              await connection.execute.query(
                SQL`INSERT INTO test_table (id, value) VALUES (2, "test") RETURNING id`,
              );

              const result = await connection2.withTransaction<{
                id: null | string;
              }>(
                () => {
                  throw new Error('Intentionally throwing');
                },
                { mode: 'session_based' },
              );

              return { success: true, result: result };
            },
            { mode: 'session_based' },
          );
        } catch (error) {
          assert.strictEqual(
            (error as Error).message,
            'Intentionally throwing',
          );
        }

        const rows = await connection.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_table`,
        );

        // Note:
        // D1 transactions are not rolling back, as they are not supported
        // You need to use batch to have atomic operations
        assert.strictEqual(rows.rows[0]?.count, 1);
      } finally {
        await connection.close();
        await pool.close();
      }
    });

    it('transactions errors inside the outer transaction for a singleton should try catch and NOT roll back everything', async () => {
      const pool = d1Pool({
        database,
        transactionOptions: {
          allowNestedTransactions: true,
          mode: 'session_based',
        },
      });
      const connection = await pool.connection();
      const connection2 = await pool.connection();

      try {
        await connection.execute.query(
          SQL`CREATE TABLE test_table (id INTEGER, value TEXT)`,
        );

        try {
          await connection.withTransaction<{
            id: null | string;
          }>(
            async () => {
              await connection.execute.query(
                SQL`INSERT INTO test_table (id, value) VALUES (1, "test") RETURNING id`,
              );

              await connection2.withTransaction<number>(
                async () => {
                  const result = await connection2.execute.query(
                    SQL`INSERT INTO test_table (id, value) VALUES (2, "test") RETURNING id`,
                  );
                  return (result.rows[0]?.id as number) ?? null;
                },
                { mode: 'session_based' },
              );

              throw new Error('Intentionally throwing');
            },
            { mode: 'session_based' },
          );
        } catch (error) {
          // make sure the error is the correct one. catch but let it continue so it doesn't trigger
          // the outer errors
          assert.strictEqual(
            (error as Error).message,
            'Intentionally throwing',
          );
        }
        const rows = await connection.execute.query(
          SQL`SELECT COUNT(*) as count FROM test_table`,
        );

        // Note:
        // D1 transactions are not rolling back, as they are not supported
        // You need to use batch to have atomic operations
        assert.strictEqual(rows.rows[0]?.count, 2);
      } finally {
        await connection.close();
        await pool.close();
      }
    });
  });
});
