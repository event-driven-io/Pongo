import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterEach, describe, it } from 'vitest';
import { sqlite3Pool } from '..';
import { SQL } from '../../../../core';
import { InMemorySQLiteDatabase } from '../../core';

describe('SQLite3 Transactions', () => {
  const inMemoryfileName: string = InMemorySQLiteDatabase;

  const testDatabasePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
  );
  const fileName = path.resolve(testDatabasePath, 'test-transactions.db');

  const testCases = [
    { testName: 'in-memory', fileName: inMemoryfileName },
    { testName: 'file', fileName: fileName },
  ];

  afterEach(() => {
    if (!fs.existsSync(fileName)) {
      return;
    }
    try {
      fs.unlinkSync(fileName);
      fs.unlinkSync(`${fileName}-shm`);
      fs.unlinkSync(`${fileName}-wal`);
    } catch (error) {
      console.log('Error deleting file:', error);
    }
  });

  for (const { testName, fileName } of testCases) {
    describe(`transactions with ${testName} database`, () => {
      it('commits a nested transaction with pool', async () => {
        const pool = sqlite3Pool({
          fileName,
          transactionOptions: { allowNestedTransactions: true },
        });
        const connection = await pool.connection();

        try {
          await connection.execute.query(
            SQL`CREATE TABLE test_table (id INTEGER, value TEXT)`,
          );

          const result = await connection.withTransaction<number>(async () => {
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
          });

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
      it('keeps the outer transaction open after a sibling nested transaction commits', async () => {
        const pool = sqlite3Pool({
          fileName,
          transactionOptions: { allowNestedTransactions: true },
        });

        try {
          await pool.execute.command(
            SQL`CREATE TABLE test_table (id INTEGER PRIMARY KEY, value TEXT)`,
          );

          await pool.withTransaction(async (outerTx) => {
            await pool.withTransaction(async (innerTx) => {
              await innerTx.execute.command(
                SQL`INSERT INTO test_table (id, value) VALUES (1, 'first')`,
              );
            });

            await pool.withTransaction(async (innerTx) => {
              await innerTx.execute.command(
                SQL`INSERT INTO test_table (id, value) VALUES (2, 'second')`,
              );
            });

            await outerTx.execute.command(
              SQL`INSERT INTO test_table (id, value) VALUES (3, 'outer')`,
            );
          });

          const rows = await pool.execute.query<{ count: number }>(
            SQL`SELECT COUNT(*) as count FROM test_table`,
          );
          assert.strictEqual(rows.rows[0]?.count, 3);
        } finally {
          await pool.close();
        }
      });

      it('should fail with an error if transaction nested is false', async () => {
        const pool = sqlite3Pool({
          fileName,
          transactionOptions: { allowNestedTransactions: false },
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

            const result = await connection.withTransaction<number>(
              async () => {
                const result = await connection.execute.query(
                  SQL`INSERT INTO test_table (id, value) VALUES (1, "test") RETURNING id`,
                );
                return (result.rows[0]?.id as number) ?? null;
              },
            );

            return result;
          });
        } catch (error) {
          assert.strictEqual(
            (error as Error).message,
            'Cannot start a nested transaction: allowNestedTransactions is false. Set transactionOptions: { allowNestedTransactions: true } on your pool or connection.',
          );
        } finally {
          await connection.close();
          await pool.close();
        }
      });

      it('should try catch and roll back everything when the inner transaction errors for a pooled connection', async () => {
        const pool = sqlite3Pool({
          fileName,
          defaultTransactionMode: 'DEFERRED',
          transactionOptions: { allowNestedTransactions: true },
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

          assert.strictEqual(rows.rows[0]?.count, 0);
        } finally {
          await connection.close();
          await pool.close();
        }
      });

      it('should try catch and roll back everything when the outer transactions errors for a pooled connection', async () => {
        const pool = sqlite3Pool({
          fileName,
          singleton: true,

          transactionOptions: { allowNestedTransactions: true },
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

          assert.strictEqual(rows.rows[0]?.count, 0);
        } finally {
          await connection.close();
          await pool.close();
        }
      });

      it('commits a nested transaction with singleton pool', async () => {
        const pool = sqlite3Pool({
          fileName,
          singleton: true,

          transactionOptions: { allowNestedTransactions: true },
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

      it('transactions errors inside the nested inner transaction for a singleton should try catch and roll back everything', async () => {
        const pool = sqlite3Pool({
          fileName,
          defaultTransactionMode: 'DEFERRED',
          transactionOptions: { allowNestedTransactions: true },
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

          assert.strictEqual(rows.rows[0]?.count, 0);
        } finally {
          await connection.close();
          await pool.close();
        }
      });

      it('transactions errors inside the outer transaction for a singleton should try catch and roll back everything', async () => {
        const pool = sqlite3Pool({
          fileName,
          singleton: true,
          transactionOptions: { allowNestedTransactions: true },
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

          assert.strictEqual(rows.rows[0]?.count, 0);
        } finally {
          await connection.close();
          await pool.close();
        }
      });

      it('accepts transaction mode DEFERRED', async () => {
        const pool = sqlite3Pool({ fileName });
        try {
          await pool.execute.command(
            SQL`CREATE TABLE test_mode (id INTEGER PRIMARY KEY, value TEXT)`,
          );
          await pool.execute.command(
            SQL`INSERT INTO test_mode (id, value) VALUES (1, 'test')`,
          );

          await pool.withTransaction<void>(
            async (tx) => {
              const result = await tx.execute.query(
                SQL`SELECT value FROM test_mode WHERE id = 1`,
              );
              assert.strictEqual(result.rows[0]?.value, 'test');
              return { success: true, result: undefined };
            },
            { mode: 'DEFERRED' },
          );
        } finally {
          await pool.close();
        }
      });

      it('accepts transaction mode IMMEDIATE', async () => {
        const pool = sqlite3Pool({ fileName });
        try {
          await pool.execute.command(
            SQL`CREATE TABLE test_mode_imm (id INTEGER PRIMARY KEY, value TEXT)`,
          );
          await pool.execute.command(
            SQL`INSERT INTO test_mode_imm (id, value) VALUES (1, 'test')`,
          );

          await pool.withTransaction<void>(
            async (tx) => {
              const result = await tx.execute.query(
                SQL`SELECT value FROM test_mode_imm WHERE id = 1`,
              );
              assert.strictEqual(result.rows[0]?.value, 'test');
              return { success: true, result: undefined };
            },
            { mode: 'IMMEDIATE' },
          );
        } finally {
          await pool.close();
        }
      });

      it('accepts transaction mode EXCLUSIVE', async () => {
        const pool = sqlite3Pool({ fileName });
        try {
          await pool.execute.command(
            SQL`CREATE TABLE test_mode_exc (id INTEGER PRIMARY KEY, value TEXT)`,
          );
          await pool.execute.command(
            SQL`INSERT INTO test_mode_exc (id, value) VALUES (1, 'test')`,
          );

          await pool.withTransaction<void>(
            async (tx) => {
              const result = await tx.execute.query(
                SQL`SELECT value FROM test_mode_exc WHERE id = 1`,
              );
              assert.strictEqual(result.rows[0]?.value, 'test');
              return { success: true, result: undefined };
            },
            { mode: 'EXCLUSIVE' },
          );
        } finally {
          await pool.close();
        }
      });

      it('accepts readonly in transaction options', async () => {
        const pool = sqlite3Pool({ fileName });
        try {
          await pool.execute.command(
            SQL`CREATE TABLE test_readonly (id INTEGER PRIMARY KEY, value TEXT)`,
          );
          await pool.execute.command(
            SQL`INSERT INTO test_readonly (id, value) VALUES (1, 'test')`,
          );

          await pool.withTransaction<void>(
            async (tx) => {
              const result = await tx.execute.query(
                SQL`SELECT value FROM test_readonly WHERE id = 1`,
              );
              assert.strictEqual(result.rows[0]?.value, 'test');
              return { success: true, result: undefined };
            },
            { readonly: true },
          );
        } finally {
          await pool.close();
        }
      });

      it('accepts both mode and readonly in transaction options', async () => {
        const pool = sqlite3Pool({ fileName });
        try {
          await pool.execute.command(
            SQL`CREATE TABLE test_mode_readonly (id INTEGER PRIMARY KEY, value TEXT)`,
          );
          await pool.execute.command(
            SQL`INSERT INTO test_mode_readonly (id, value) VALUES (1, 'test')`,
          );

          await pool.withTransaction<void>(
            async (tx) => {
              const result = await tx.execute.query(
                SQL`SELECT value FROM test_mode_readonly WHERE id = 1`,
              );
              assert.strictEqual(result.rows[0]?.value, 'test');
              return { success: true, result: undefined };
            },
            { mode: 'DEFERRED', readonly: true },
          );
        } finally {
          await pool.close();
        }
      });
    });
  }

  describe('concurrent transactions on dual pool', () => {
    for (const { testName, fileName } of testCases) {
      it(`serializes concurrent withTransaction calls with ${testName} database`, async () => {
        const pool = sqlite3Pool({
          fileName,
          transactionOptions: { allowNestedTransactions: true },
        });

        try {
          await pool.execute.command(
            SQL`CREATE TABLE concurrent_test (id INTEGER PRIMARY KEY, value TEXT)`,
          );

          const concurrentInserts = Array.from({ length: 20 }, (_, i) =>
            pool.withTransaction(async (tx) => {
              await tx.execute.command(
                SQL`INSERT INTO concurrent_test (id, value) VALUES (${i + 1}, ${`value-${i + 1}`})`,
              );
            }),
          );

          await Promise.all(concurrentInserts);

          const rows = await pool.execute.query<{ count: number }>(
            SQL`SELECT COUNT(*) as count FROM concurrent_test`,
          );
          assert.strictEqual(rows.rows[0]?.count, 20);
        } finally {
          await pool.close();
        }
      });

      it(`keeps a plain command outside of an open transaction with ${testName} database`, async () => {
        const pool = sqlite3Pool({
          fileName,
          transactionOptions: { allowNestedTransactions: true },
        });

        try {
          await pool.execute.command(
            SQL`CREATE TABLE plain_isolation (id INTEGER PRIMARY KEY, value TEXT)`,
          );

          let releaseTx: () => void = () => {};
          let plainMayStart: () => void = () => {};
          const txMayProceed = new Promise<void>((r) => {
            releaseTx = r;
          });
          const plainCanStart = new Promise<void>((r) => {
            plainMayStart = r;
          });

          const txPromise = pool.withTransaction(async (tx) => {
            await tx.execute.command(
              SQL`INSERT INTO plain_isolation (id, value) VALUES (1, 'tx-row')`,
            );
            plainMayStart();
            await txMayProceed;
            throw new Error('tx intentional rollback');
          });

          await plainCanStart;

          const plainPromise = pool.execute.command(
            SQL`INSERT INTO plain_isolation (id, value) VALUES (2, 'plain-row')`,
          );

          releaseTx();

          await assert.rejects(txPromise, /tx intentional rollback/);
          await plainPromise;

          const rows = await pool.execute.query<{
            id: number;
            value: string;
          }>(SQL`SELECT id, value FROM plain_isolation ORDER BY id`);

          assert.deepStrictEqual(
            rows.rows.map((r) => r.value),
            ['plain-row'],
          );
        } finally {
          await pool.close();
        }
      });

      it(`isolates a failing parallel transaction from a successful one with ${testName} database`, async () => {
        const pool = sqlite3Pool({
          fileName,
          transactionOptions: { allowNestedTransactions: true },
        });

        try {
          await pool.execute.command(
            SQL`CREATE TABLE isolation_test (id INTEGER PRIMARY KEY, value TEXT)`,
          );

          const a = pool.withTransaction(async (tx) => {
            await tx.execute.command(
              SQL`INSERT INTO isolation_test (id, value) VALUES (1, 'a-commits')`,
            );
          });

          const b = pool.withTransaction(async (tx) => {
            await tx.execute.command(
              SQL`INSERT INTO isolation_test (id, value) VALUES (2, 'b-rolls-back')`,
            );
            throw new Error('B intentional failure');
          });

          const results = await Promise.allSettled([a, b]);

          assert.strictEqual(results[0]?.status, 'fulfilled');
          assert.strictEqual(results[1]?.status, 'rejected');
          assert.match(
            (results[1].reason as Error).message,
            /B intentional failure/,
          );

          const rows = await pool.execute.query<{
            id: number;
            value: string;
          }>(SQL`SELECT id, value FROM isolation_test ORDER BY id`);

          assert.deepStrictEqual(
            rows.rows.map((r) => r.value),
            ['a-commits'],
          );
        } finally {
          await pool.close();
        }
      });

      // Reentrancy: a writer-bound call from inside an already-active writer
      // task (same async stack) must bypass the queue instead of deadlocking.
      // These tests exercise the patterns emmett relies on (workflow processor
      // calling messageStore.appendToStream inside its tx handler).
      it(
        `allows pool.withConnection reentry from inside pool.withTransaction with ${testName} database`,
        { timeout: 5000 },
        async () => {
          const pool = sqlite3Pool({
            fileName,
            transactionOptions: { allowNestedTransactions: true },
          });

          try {
            await pool.execute.command(
              SQL`CREATE TABLE reentry_with_conn (id INTEGER PRIMARY KEY, value TEXT)`,
            );

            await pool.withTransaction(async (tx) => {
              await tx.execute.command(
                SQL`INSERT INTO reentry_with_conn (id, value) VALUES (1, 'outer')`,
              );

              await pool.withConnection(async (conn) => {
                await conn.execute.command(
                  SQL`INSERT INTO reentry_with_conn (id, value) VALUES (2, 'inner')`,
                );
              });
            });

            const rows = await pool.execute.query<{ count: number }>(
              SQL`SELECT COUNT(*) as count FROM reentry_with_conn`,
            );
            assert.strictEqual(rows.rows[0]?.count, 2);
          } finally {
            await pool.close();
          }
        },
      );

      it(
        `allows pool.execute.command reentry from inside pool.withTransaction with ${testName} database`,
        { timeout: 5000 },
        async () => {
          const pool = sqlite3Pool({
            fileName,
            transactionOptions: { allowNestedTransactions: true },
          });

          try {
            await pool.execute.command(
              SQL`CREATE TABLE reentry_with_cmd (id INTEGER PRIMARY KEY, value TEXT)`,
            );

            await pool.withTransaction(async (tx) => {
              await tx.execute.command(
                SQL`INSERT INTO reentry_with_cmd (id, value) VALUES (1, 'outer')`,
              );

              await pool.execute.command(
                SQL`INSERT INTO reentry_with_cmd (id, value) VALUES (2, 'inner-plain')`,
              );
            });

            const rows = await pool.execute.query<{ count: number }>(
              SQL`SELECT COUNT(*) as count FROM reentry_with_cmd`,
            );
            assert.strictEqual(rows.rows[0]?.count, 2);
          } finally {
            await pool.close();
          }
        },
      );

      it(
        `allows nested pool.withTransaction reentry with ${testName} database`,
        { timeout: 5000 },
        async () => {
          const pool = sqlite3Pool({
            fileName,
            transactionOptions: { allowNestedTransactions: true },
          });

          try {
            await pool.execute.command(
              SQL`CREATE TABLE reentry_nested_tx (id INTEGER PRIMARY KEY, value TEXT)`,
            );

            await pool.withTransaction(async (outerTx) => {
              await outerTx.execute.command(
                SQL`INSERT INTO reentry_nested_tx (id, value) VALUES (1, 'outer')`,
              );

              await pool.withTransaction(async (innerTx) => {
                await innerTx.execute.command(
                  SQL`INSERT INTO reentry_nested_tx (id, value) VALUES (2, 'inner')`,
                );
              });
            });

            const rows = await pool.execute.query<{ count: number }>(
              SQL`SELECT COUNT(*) as count FROM reentry_nested_tx`,
            );
            assert.strictEqual(rows.rows[0]?.count, 2);
          } finally {
            await pool.close();
          }
        },
      );

      // Mirrors the emmett workflow scenario: outer pool.withConnection holds
      // the writer, the workflow opens connection.withTransaction on it, then
      // an inner messageStore.appendToStream re-enters pool.withConnection,
      // which itself opens connection.withTransaction. That's the exact stack
      // that deadlocked the LLMAgentWorkflow.
      it(
        `survives nested pool.withConnection inside connection.withTransaction with ${testName} database`,
        { timeout: 5000 },
        async () => {
          const pool = sqlite3Pool({
            fileName,
            transactionOptions: { allowNestedTransactions: true },
          });

          try {
            await pool.execute.command(
              SQL`CREATE TABLE reentry_emmett (id INTEGER PRIMARY KEY, value TEXT)`,
            );

            await pool.withConnection(async (outerConn) => {
              await outerConn.withTransaction(async (outerTx) => {
                await outerTx.execute.command(
                  SQL`INSERT INTO reentry_emmett (id, value) VALUES (1, 'outer-tx')`,
                );

                await pool.withConnection(async (innerConn) => {
                  await innerConn.withTransaction(async (innerTx) => {
                    await innerTx.execute.command(
                      SQL`INSERT INTO reentry_emmett (id, value) VALUES (2, 'inner-tx')`,
                    );
                  });
                });
              });
            });

            const rows = await pool.execute.query<{ count: number }>(
              SQL`SELECT COUNT(*) as count FROM reentry_emmett`,
            );
            assert.strictEqual(rows.rows[0]?.count, 2);
          } finally {
            await pool.close();
          }
        },
      );

      it(`serializes concurrent withConnection writes with ${testName} database`, async () => {
        const pool = sqlite3Pool({
          fileName,
          transactionOptions: { allowNestedTransactions: true },
        });

        try {
          await pool.execute.command(
            SQL`CREATE TABLE concurrent_conn_test (id INTEGER PRIMARY KEY, value TEXT)`,
          );

          const concurrentOps = Array.from({ length: 20 }, (_, i) =>
            pool.withConnection(
              async (connection) => {
                await connection.withTransaction(async () => {
                  await connection.execute.command(
                    SQL`INSERT INTO concurrent_conn_test (id, value) VALUES (${i + 1}, ${`value-${i + 1}`})`,
                  );
                });
              },
              { readonly: false },
            ),
          );

          await Promise.all(concurrentOps);

          const rows = await pool.execute.query<{ count: number }>(
            SQL`SELECT COUNT(*) as count FROM concurrent_conn_test`,
          );
          assert.strictEqual(rows.rows[0]?.count, 20);
        } finally {
          await pool.close();
        }
      });
    }
  });

  describe('transaction modes', () => {
    it('uses IMMEDIATE mode by default', async () => {
      const pool = sqlite3Pool({ fileName: inMemoryfileName });
      const connection = await pool.connection();

      try {
        await connection.execute.query(
          SQL`CREATE TABLE test_table (id INTEGER, value TEXT)`,
        );

        await connection.withTransaction(async () => {
          await connection.execute.query(
            SQL`INSERT INTO test_table (id, value) VALUES (1, "test")`,
          );
        });

        const rows = await connection.execute.query<{ count: number }>(
          SQL`SELECT COUNT(*) as count FROM test_table`,
        );
        assert.strictEqual(rows.rows[0]?.count, 1);
      } finally {
        await connection.close();
        await pool.close();
      }
    });

    it('can override to DEFERRED mode', async () => {
      const pool = sqlite3Pool({ fileName: inMemoryfileName });
      const connection = await pool.connection();

      try {
        await connection.execute.query(
          SQL`CREATE TABLE test_table (id INTEGER, value TEXT)`,
        );

        await connection.withTransaction(
          async () => {
            await connection.execute.query(
              SQL`INSERT INTO test_table (id, value) VALUES (1, "test")`,
            );
          },
          { mode: 'DEFERRED' },
        );

        const rows = await connection.execute.query<{ count: number }>(
          SQL`SELECT COUNT(*) as count FROM test_table`,
        );
        assert.strictEqual(rows.rows[0]?.count, 1);
      } finally {
        await connection.close();
        await pool.close();
      }
    });

    it('can override to EXCLUSIVE mode', async () => {
      const pool = sqlite3Pool({ fileName: inMemoryfileName });
      const connection = await pool.connection();

      try {
        await connection.execute.query(
          SQL`CREATE TABLE test_table (id INTEGER, value TEXT)`,
        );

        await connection.withTransaction(
          async () => {
            await connection.execute.query(
              SQL`INSERT INTO test_table (id, value) VALUES (1, "test")`,
            );
          },
          { mode: 'EXCLUSIVE' },
        );

        const rows = await connection.execute.query<{ count: number }>(
          SQL`SELECT COUNT(*) as count FROM test_table`,
        );
        assert.strictEqual(rows.rows[0]?.count, 1);
      } finally {
        await connection.close();
        await pool.close();
      }
    });

    it('respects defaultTransactionMode from connection options', async () => {
      const pool = sqlite3Pool({
        fileName: inMemoryfileName,
        defaultTransactionMode: 'DEFERRED',
      });
      const connection = await pool.connection();

      try {
        await connection.execute.query(
          SQL`CREATE TABLE test_table (id INTEGER, value TEXT)`,
        );

        await connection.withTransaction(async () => {
          await connection.execute.query(
            SQL`INSERT INTO test_table (id, value) VALUES (1, "test")`,
          );
        });

        const rows = await connection.execute.query<{ count: number }>(
          SQL`SELECT COUNT(*) as count FROM test_table`,
        );
        assert.strictEqual(rows.rows[0]?.count, 1);
      } finally {
        await connection.close();
        await pool.close();
      }
    });

    it('transaction option mode overrides defaultTransactionMode', async () => {
      const pool = sqlite3Pool({
        fileName: inMemoryfileName,
        defaultTransactionMode: 'DEFERRED',
      });
      const connection = await pool.connection();

      try {
        await connection.execute.query(
          SQL`CREATE TABLE test_table (id INTEGER, value TEXT)`,
        );

        await connection.withTransaction(
          async () => {
            await connection.execute.query(
              SQL`INSERT INTO test_table (id, value) VALUES (1, "test")`,
            );
          },
          { mode: 'IMMEDIATE' },
        );

        const rows = await connection.execute.query<{ count: number }>(
          SQL`SELECT COUNT(*) as count FROM test_table`,
        );
        assert.strictEqual(rows.rows[0]?.count, 1);
      } finally {
        await connection.close();
        await pool.close();
      }
    });
  });
});
