import type { D1Database } from '@cloudflare/workers-types';
import assert from 'assert';
import { Miniflare } from 'miniflare';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { d1Pool } from '..';
import { SQL } from '../../../../core';

void describe('D1 Transactions', () => {
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

  void describe(`transactions with database`, () => {
    void it('commits a nested transaction with pool', async () => {
      const pool = d1Pool({
        database,
        allowNestedTransactions: true,
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
          { mode: 'compatible' },
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
    void it('should fail with an error if transaction nested is false', async () => {
      const pool = d1Pool({
        database,
        allowNestedTransactions: false,
      });
      const connection = await pool.connection();

      try {
        await connection.execute.query(
          SQL`CREATE TABLE test_table (id INTEGER, value TEXT)`,
        );

        await connection.withTransaction<number>(async () => {
          await connection.execute.query(
            SQL`INSERT INTO test_table (id, value) VALUES (2, "test") RETURNING id`,
          );

          const result = await connection.withTransaction<number>(async () => {
            const result = await connection.execute.query(
              SQL`INSERT INTO test_table (id, value) VALUES (1, "test") RETURNING id`,
            );
            return (result.rows[0]?.id as number) ?? null;
          });

          return result;
        });
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

    void it('should try catch and NOT roll back everything when the inner transaction errors for a pooled connection', async () => {
      const pool = d1Pool({
        database,
        allowNestedTransactions: true,
      });
      const connection = await pool.connection();
      const connection2 = await pool.connection();

      try {
        await connection.execute.query(
          SQL`CREATE TABLE test_table (id INTEGER, value TEXT)`,
        );

        try {
          await connection.withTransaction<void>(async () => {
            await connection.execute.query(
              SQL`INSERT INTO test_table (id, value) VALUES (2, "test") RETURNING id`,
            );

            await connection2.withTransaction<number>(() => {
              throw new Error('Intentionally throwing');
            });
          });
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

    void it('should try catch and NOT roll back everything when the outer transactions errors for a pooled connection', async () => {
      const pool = d1Pool({
        database,
        allowNestedTransactions: true,
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
          }>(async () => {
            await connection.execute.query(
              SQL`INSERT INTO test_table (id, value) VALUES (1, "test") RETURNING id`,
            );

            await connection2.withTransaction<number>(async () => {
              const result = await connection2.execute.query(
                SQL`INSERT INTO test_table_s (id, value) VALUES (2, "test") RETURNING id`,
              );
              return (result.rows[0]?.id as number) ?? null;
            });

            throw new Error('Intentionally throwing');
          });
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

    void it('commits a nested transaction with singleton pool', async () => {
      const pool = d1Pool({
        database,
        allowNestedTransactions: true,
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
            );

            return result;
          },
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

    void it('transactions errors inside the nested inner transaction for a singleton should try catch and NOT roll back everything', async () => {
      const pool = d1Pool({
        database,
        allowNestedTransactions: true,
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
          }>(async () => {
            await connection.execute.query(
              SQL`INSERT INTO test_table (id, value) VALUES (2, "test") RETURNING id`,
            );

            const result = await connection2.withTransaction<{
              id: null | string;
            }>(() => {
              throw new Error('Intentionally throwing');
            });

            return { success: true, result: result };
          });
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

    void it('transactions errors inside the outer transaction for a singleton should try catch and NOT roll back everything', async () => {
      const pool = d1Pool({
        database,
        allowNestedTransactions: true,
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
          }>(async () => {
            await connection.execute.query(
              SQL`INSERT INTO test_table (id, value) VALUES (1, "test") RETURNING id`,
            );

            await connection2.withTransaction<number>(async () => {
              const result = await connection2.execute.query(
                SQL`INSERT INTO test_table (id, value) VALUES (2, "test") RETURNING id`,
              );
              return (result.rows[0]?.id as number) ?? null;
            });

            throw new Error('Intentionally throwing');
          });
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
