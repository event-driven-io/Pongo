import assert from 'assert';
import fs from 'fs';
import { afterEach, describe, it } from 'node:test';
import {
  CheckViolationError,
  DumboError,
  ForeignKeyViolationError,
  IntegrityConstraintViolationError,
  InvalidOperationError,
  LockNotAvailableError,
  NotNullViolationError,
  SQL,
  UniqueConstraintError,
} from '../../../../core';
import { sqlite3Pool } from '../../../../sqlite3';
import { InMemorySQLiteDatabase } from '../../core';

void describe('SQLite3 error mapping', () => {
  let pool: ReturnType<typeof sqlite3Pool>;

  afterEach(async () => {
    await pool.close();
  });

  void describe('integrity constraint violations', () => {
    void it('maps unique constraint violation to UniqueConstraintError', async () => {
      pool = sqlite3Pool({ fileName: InMemorySQLiteDatabase });
      try {
        await pool.execute.command(
          SQL`CREATE TABLE IF NOT EXISTS test_unique (id INTEGER PRIMARY KEY, value TEXT)`,
        );
        await pool.execute.command(
          SQL`INSERT INTO test_unique (id, value) VALUES (1, 'a')`,
        );

        await assert.rejects(
          () =>
            pool.execute.command(
              SQL`INSERT INTO test_unique (id, value) VALUES (1, 'b')`,
            ),
          (error) => {
            assert.ok(error instanceof UniqueConstraintError);
            assert.ok(error instanceof IntegrityConstraintViolationError);
            assert.ok(error instanceof DumboError);
            assert.ok(
              DumboError.isInstanceOf(error, {
                errorType: UniqueConstraintError.ErrorType,
              }),
            );
            assert.ok(
              DumboError.isInstanceOf(error, {
                errorCode: IntegrityConstraintViolationError.ErrorCode,
              }),
            );
            assert.ok(error.innerError);
            return true;
          },
        );
      } finally {
        await pool.execute.command(SQL`DROP TABLE IF EXISTS test_unique`);
      }
    });

    void it('maps NOT NULL violation to NotNullViolationError', async () => {
      pool = sqlite3Pool({ fileName: InMemorySQLiteDatabase });
      try {
        await pool.execute.command(
          SQL`CREATE TABLE IF NOT EXISTS test_notnull (id INTEGER PRIMARY KEY, value TEXT NOT NULL)`,
        );

        await assert.rejects(
          () =>
            pool.execute.command(
              SQL`INSERT INTO test_notnull (id, value) VALUES (1, NULL)`,
            ),
          (error) => {
            assert.ok(error instanceof NotNullViolationError);
            assert.ok(error instanceof IntegrityConstraintViolationError);
            assert.ok(
              DumboError.isInstanceOf(error, {
                errorType: NotNullViolationError.ErrorType,
              }),
            );
            return true;
          },
        );
      } finally {
        await pool.execute.command(SQL`DROP TABLE IF EXISTS test_notnull`);
      }
    });

    void it('maps foreign key violation to ForeignKeyViolationError', async () => {
      pool = sqlite3Pool({ fileName: InMemorySQLiteDatabase });
      try {
        // SQLite has foreign keys disabled by default
        await pool.execute.command(SQL`PRAGMA foreign_keys = ON`);
        await pool.execute.command(
          SQL`CREATE TABLE IF NOT EXISTS test_parent (id INTEGER PRIMARY KEY)`,
        );
        await pool.execute.command(
          SQL`CREATE TABLE IF NOT EXISTS test_child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES test_parent(id))`,
        );

        await assert.rejects(
          () =>
            pool.execute.command(
              SQL`INSERT INTO test_child (id, parent_id) VALUES (1, 999)`,
            ),
          (error) => {
            assert.ok(error instanceof ForeignKeyViolationError);
            assert.ok(error instanceof IntegrityConstraintViolationError);
            assert.ok(
              DumboError.isInstanceOf(error, {
                errorType: ForeignKeyViolationError.ErrorType,
              }),
            );
            return true;
          },
        );
      } finally {
        await pool.execute.command(SQL`DROP TABLE IF EXISTS test_child`);
        await pool.execute.command(SQL`DROP TABLE IF EXISTS test_parent`);
      }
    });

    void it('maps CHECK violation to CheckViolationError', async () => {
      pool = sqlite3Pool({ fileName: InMemorySQLiteDatabase });
      try {
        await pool.execute.command(
          SQL`CREATE TABLE IF NOT EXISTS test_check (id INTEGER PRIMARY KEY, value INTEGER CHECK (value > 0))`,
        );

        await assert.rejects(
          () =>
            pool.execute.command(
              SQL`INSERT INTO test_check (id, value) VALUES (1, -1)`,
            ),
          (error) => {
            assert.ok(error instanceof CheckViolationError);
            assert.ok(error instanceof IntegrityConstraintViolationError);
            assert.ok(
              DumboError.isInstanceOf(error, {
                errorType: CheckViolationError.ErrorType,
              }),
            );
            return true;
          },
        );
      } finally {
        await pool.execute.command(SQL`DROP TABLE IF EXISTS test_check`);
      }
    });
  });

  void describe('syntax and access errors', () => {
    void it('maps syntax error to InvalidOperationError', async () => {
      pool = sqlite3Pool({ fileName: InMemorySQLiteDatabase });
      await assert.rejects(
        () => pool.execute.command(SQL`SELEC 1`),
        (error) => {
          assert.ok(error instanceof InvalidOperationError);
          assert.ok(error instanceof DumboError);
          assert.ok(
            DumboError.isInstanceOf(error, {
              errorType: InvalidOperationError.ErrorType,
            }),
          );
          return true;
        },
      );
    });

    void it('maps undefined table to InvalidOperationError', async () => {
      pool = sqlite3Pool({ fileName: InMemorySQLiteDatabase });
      await assert.rejects(
        () =>
          pool.execute.query(
            SQL`SELECT * FROM table_that_does_not_exist_at_all`,
          ),
        (error) => {
          assert.ok(error instanceof InvalidOperationError);
          return true;
        },
      );
    });
  });

  void describe('error mapping in transactions', () => {
    void it('maps unique constraint violation to UniqueConstraintError inside a transaction', async () => {
      pool = sqlite3Pool({ fileName: InMemorySQLiteDatabase });
      const connection = await pool.connection();

      try {
        await connection.execute.command(
          SQL`CREATE TABLE IF NOT EXISTS test_tx_unique (id INTEGER PRIMARY KEY, value TEXT)`,
        );
        await connection.execute.command(
          SQL`INSERT INTO test_tx_unique (id, value) VALUES (1, 'a')`,
        );

        await assert.rejects(
          () =>
            connection.withTransaction(async () => {
              await connection.execute.command(
                SQL`INSERT INTO test_tx_unique (id, value) VALUES (1, 'b')`,
              );
            }),
          (error) => {
            assert.ok(
              error instanceof UniqueConstraintError,
              `Expected UniqueConstraintError but got ${(error as Error).constructor.name}: ${(error as Error).message}`,
            );
            assert.ok(error instanceof IntegrityConstraintViolationError);
            assert.ok(error instanceof DumboError);
            assert.ok(
              DumboError.isInstanceOf(error, {
                errorType: UniqueConstraintError.ErrorType,
              }),
            );
            return true;
          },
        );
      } finally {
        await connection.execute.command(
          SQL`DROP TABLE IF EXISTS test_tx_unique`,
        );
        await connection.close();
      }
    });
  });

  void describe('preserves inner error', () => {
    void it('wraps original sqlite3 error as innerError', async () => {
      pool = sqlite3Pool({ fileName: InMemorySQLiteDatabase });
      try {
        await pool.execute.command(
          SQL`CREATE TABLE IF NOT EXISTS test_inner (id INTEGER PRIMARY KEY)`,
        );
        await pool.execute.command(SQL`INSERT INTO test_inner (id) VALUES (1)`);

        await assert.rejects(
          () =>
            pool.execute.command(SQL`INSERT INTO test_inner (id) VALUES (1)`),
          (error) => {
            assert.ok(error instanceof DumboError);
            assert.ok(DumboError.isInstanceOf(error));
            assert.ok(error.innerError);
            assert.ok('code' in error.innerError);
            assert.strictEqual(
              (error.innerError as Error & { code: string }).code,
              'SQLITE_CONSTRAINT',
            );
            return true;
          },
        );
      } finally {
        await pool.execute.command(SQL`DROP TABLE IF EXISTS test_inner`);
      }
    });
  });

  void describe('lock and busy errors', () => {
    void it('maps SQLITE_BUSY to LockNotAvailableError when BEGIN TRANSACTION fails', async () => {
      // This test replicates the original issue: SQLITE_BUSY thrown during
      // BEGIN TRANSACTION was not mapped because transaction.begin() calls
      // client.query() directly, bypassing the executor wrapper.
      const testFile = `/tmp/test-busy-${Date.now()}.db`;

      const pool1 = sqlite3Pool({
        fileName: testFile,
        pragmaOptions: { busy_timeout: 1 },
      });
      const pool2 = sqlite3Pool({
        fileName: testFile,
        pragmaOptions: { busy_timeout: 1 },
      });

      try {
        await pool1.execute.command(
          SQL`CREATE TABLE IF NOT EXISTS test_busy (id INTEGER PRIMARY KEY, value TEXT)`,
        );
        await pool1.execute.command(
          SQL`INSERT INTO test_busy (id, value) VALUES (1, 'initial')`,
        );

        const conn1 = await pool1.connection();

        await conn1.withTransaction(async (tx) => {
          // Hold the write lock
          await tx.execute.command(
            SQL`UPDATE test_busy SET value = 'updated' WHERE id = 1`,
          );

          // pool2 tries to start an IMMEDIATE transaction while pool1 holds the lock.
          // This triggers SQLITE_BUSY during BEGIN IMMEDIATE TRANSACTION,
          // which calls client.query() directly in transaction.begin().
          const conn2 = await pool2.connection();
          try {
            await assert.rejects(
              () =>
                conn2.withTransaction(
                  () => {
                    // Should never reach here
                    assert.fail('Should have thrown LockNotAvailableError');
                  },
                  { mode: 'IMMEDIATE' },
                ),
              (error) => {
                assert.ok(
                  error instanceof LockNotAvailableError,
                  `Expected LockNotAvailableError but got ${(error as Error).constructor.name}: ${(error as Error).message}`,
                );
                assert.ok(error instanceof DumboError);
                assert.ok(
                  DumboError.isInstanceOf(error, {
                    errorType: LockNotAvailableError.ErrorType,
                  }),
                );
                assert.ok(error.innerError);
                assert.ok('code' in error.innerError);
                assert.strictEqual(
                  (error.innerError as Error & { code: string }).code,
                  'SQLITE_BUSY',
                );
                return true;
              },
            );
          } finally {
            await conn2.close();
          }
        });

        await conn1.close();
      } finally {
        await pool1.close();
        await pool2.close();
        try {
          fs.unlinkSync(testFile);
          fs.unlinkSync(`${testFile}-shm`);
          fs.unlinkSync(`${testFile}-wal`);
        } catch {
          // ignore cleanup errors
        }
      }
    });
  });
});
