import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import assert from 'assert';
import { aroundEach, describe, it } from 'vitest';
import {
  CheckViolationError,
  DumboError,
  ForeignKeyViolationError,
  IntegrityConstraintViolationError,
  InvalidOperationError,
  NotNullViolationError,
  SQL,
  UniqueConstraintError,
} from '../../../../core';
import { cloudflareDurableObjectSQLitePool } from '../pool';

describe('Cloudflare Durable Object SQLite error mapping', () => {
  let pool: ReturnType<typeof cloudflareDurableObjectSQLitePool>;

  aroundEach(async (runTest) => {
    const stub = env.TEST_OBJECT.get(env.TEST_OBJECT.newUniqueId());

    await runInDurableObject(stub, async (_instance, state) => {
      pool = cloudflareDurableObjectSQLitePool({ storage: state.storage });

      try {
        await runTest();
      } finally {
        await pool.close();
      }
    });
  });

  it('maps a unique constraint violation', async () => {
    await pool.execute.command(
      SQL`CREATE TABLE unique_items (id INTEGER PRIMARY KEY, value TEXT UNIQUE)`,
    );
    await pool.execute.command(
      SQL`INSERT INTO unique_items (id, value) VALUES (1, 'same')`,
    );

    await assert.rejects(
      () =>
        pool.execute.command(
          SQL`INSERT INTO unique_items (id, value) VALUES (2, 'same')`,
        ),
      (error) => {
        assert.ok(error instanceof UniqueConstraintError);
        assert.ok(error instanceof IntegrityConstraintViolationError);
        assert.ok(error.innerError instanceof Error);
        return true;
      },
    );
  });

  it('wraps the original workerd error as innerError', async () => {
    await pool.execute.command(
      SQL`CREATE TABLE wrapped_error_items (id INTEGER PRIMARY KEY, value TEXT UNIQUE)`,
    );
    await pool.execute.command(
      SQL`INSERT INTO wrapped_error_items (id, value) VALUES (1, 'same')`,
    );

    await assert.rejects(
      () =>
        pool.execute.command(
          SQL`INSERT INTO wrapped_error_items (id, value) VALUES (2, 'same')`,
        ),
      (error) => {
        assert.ok(error instanceof DumboError);
        assert.ok(error.innerError instanceof Error);
        assert.strictEqual(error.cause, error.innerError);
        assert.match(
          error.innerError.message,
          /UNIQUE constraint failed: wrapped_error_items\.value/,
        );
        return true;
      },
    );
  });

  it('maps a primary-key constraint violation', async () => {
    await pool.execute.command(
      SQL`CREATE TABLE primary_key_items (id INTEGER PRIMARY KEY)`,
    );
    await pool.execute.command(
      SQL`INSERT INTO primary_key_items (id) VALUES (1)`,
    );

    await assert.rejects(
      () =>
        pool.execute.command(
          SQL`INSERT INTO primary_key_items (id) VALUES (1)`,
        ),
      UniqueConstraintError,
    );
  });

  it('maps a not-null constraint violation', async () => {
    await pool.execute.command(
      SQL`CREATE TABLE not_null_items (id INTEGER PRIMARY KEY, value TEXT NOT NULL)`,
    );

    await assert.rejects(
      () =>
        pool.execute.command(
          SQL`INSERT INTO not_null_items (id, value) VALUES (1, NULL)`,
        ),
      NotNullViolationError,
    );
  });

  it('maps a foreign-key constraint violation', async () => {
    await pool.execute.command(SQL`PRAGMA foreign_keys = ON`);
    await pool.execute.command(
      SQL`CREATE TABLE parent_items (id INTEGER PRIMARY KEY)`,
    );
    await pool.execute.command(
      SQL`CREATE TABLE child_items (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent_items(id))`,
    );

    await assert.rejects(
      () =>
        pool.execute.command(
          SQL`INSERT INTO child_items (id, parent_id) VALUES (1, 999)`,
        ),
      ForeignKeyViolationError,
    );
  });

  it('maps a check constraint violation', async () => {
    await pool.execute.command(
      SQL`CREATE TABLE checked_items (id INTEGER PRIMARY KEY, value INTEGER CHECK (value > 0))`,
    );

    await assert.rejects(
      () =>
        pool.execute.command(
          SQL`INSERT INTO checked_items (id, value) VALUES (1, -1)`,
        ),
      CheckViolationError,
    );
  });

  it('maps syntax errors', async () => {
    await assert.rejects(
      () => pool.execute.command(SQL`SELEC 1`),
      InvalidOperationError,
    );
  });

  it('maps undefined-table errors', async () => {
    await assert.rejects(
      () => pool.execute.query(SQL`SELECT * FROM missing_table`),
      InvalidOperationError,
    );
  });

  it('maps constraint errors inside a transaction and rolls back', async () => {
    await pool.execute.command(
      SQL`CREATE TABLE transaction_items (id INTEGER PRIMARY KEY)`,
    );
    await pool.execute.command(
      SQL`INSERT INTO transaction_items (id) VALUES (1)`,
    );

    await assert.rejects(
      () =>
        pool.withTransaction(async (tx) => {
          await tx.execute.command(
            SQL`INSERT INTO transaction_items (id) VALUES (2)`,
          );
          await tx.execute.command(
            SQL`INSERT INTO transaction_items (id) VALUES (1)`,
          );
        }),
      (error) => {
        assert.ok(error instanceof UniqueConstraintError);
        assert.ok(error instanceof DumboError);
        return true;
      },
    );

    const result = await pool.execute.query<{ id: number }>(
      SQL`SELECT id FROM transaction_items ORDER BY id`,
    );
    assert.deepStrictEqual(result.rows, [{ id: 1 }]);
  });
});
