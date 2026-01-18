import assert from 'assert';
import fs from 'fs';
import { afterEach, describe, it } from 'node:test';
import path from 'path';
import { fileURLToPath } from 'url';
import { sqlite3Pool } from '..';
import { SQL } from '../../../../core';
import { InMemorySQLiteDatabase } from '../../core';

void describe('SQLite Transactions', () => {
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
    void describe(`transactions with ${testName} database`, () => {
      void it('commits a nested transaction with pool', async () => {
        const pool = sqlite3Pool({
          fileName,
          allowNestedTransactions: true,
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
      void it('should fail with an error if transaction nested is false', async () => {
        const pool = sqlite3Pool({
          fileName,
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
            'SQLITE_ERROR: cannot start a transaction within a transaction',
          );
        } finally {
          await connection.close();
          await pool.close();
        }
      });

      void it('should try catch and roll back everything when the inner transaction errors for a pooled connection', async () => {
        const pool = sqlite3Pool({
          fileName,
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

          assert.strictEqual(rows.rows[0]?.count, 0);
        } finally {
          await connection.close();
          await pool.close();
        }
      });

      void it('should try catch and roll back everything when the outer transactions errors for a pooled connection', async () => {
        const pool = sqlite3Pool({
          fileName,
          singleton: true,
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

          assert.strictEqual(rows.rows[0]?.count, 0);
        } finally {
          await connection.close();
          await pool.close();
        }
      });

      void it('commits a nested transaction with singleton pool', async () => {
        const pool = sqlite3Pool({
          fileName,
          singleton: true,
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

      void it('transactions errors inside the nested inner transaction for a singleton should try catch and roll back everything', async () => {
        const pool = sqlite3Pool({
          fileName,
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

          assert.strictEqual(rows.rows[0]?.count, 0);
        } finally {
          await connection.close();
          await pool.close();
        }
      });

      void it('transactions errors inside the outer transaction for a singleton should try catch and roll back everything', async () => {
        const pool = sqlite3Pool({
          fileName,
          singleton: true,
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

          assert.strictEqual(rows.rows[0]?.count, 0);
        } finally {
          await connection.close();
          await pool.close();
        }
      });
    });
  }
});
