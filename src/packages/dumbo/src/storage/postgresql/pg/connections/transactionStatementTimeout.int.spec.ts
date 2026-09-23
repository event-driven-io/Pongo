import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import assert from 'assert';
import pg from 'pg';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
} from 'vitest';
import {
  DataError,
  InvalidOperationError,
  QueryCanceledError,
  single,
  SQL,
  UniqueConstraintError,
  type SQLExecutor,
} from '../../../../core';
import { pgPool, type PgNativePool } from '.';

describe('PostgreSQL transaction statement timeout', () => {
  let postgres: StartedPostgreSqlContainer;
  let connectionString: string;
  let nativePool: pg.Pool;
  let pool: PgNativePool;

  const showStatementTimeout = async (execute: SQLExecutor = pool.execute) =>
    (
      await single(
        execute.query<{ statement_timeout: string }>(
          SQL`SHOW statement_timeout`,
        ),
      )
    ).statement_timeout;

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer('postgres:18.0').start();
    connectionString = postgres.getConnectionUri();
  });

  afterAll(async () => {
    await postgres.stop();
  });

  beforeEach(async () => {
    nativePool = new pg.Pool({ connectionString, max: 1 });
    pool = pgPool({ connectionString, pool: nativePool });
    await pool.execute.command(SQL`SET statement_timeout = '5s'`);
  });

  afterEach(async () => {
    await pool.close();
    await nativePool.end();
  });

  it('cancels a statement exceeding the transaction statement timeout and keeps the previous timeout', async () => {
    await assert.rejects(
      () =>
        pool.withTransaction(
          ({ execute }) => execute.query(SQL`SELECT pg_sleep(0.2)`),
          { statementTimeoutMs: 50 },
        ),
      QueryCanceledError,
    );

    assert.strictEqual(await showStatementTimeout(), '5s');
  });

  it('keeps the previous timeout after a committed transaction', async () => {
    await pool.withTransaction(({ execute }) => execute.query(SQL`SELECT 1`), {
      statementTimeoutMs: 50,
    });

    assert.strictEqual(await showStatementTimeout(), '5s');
  });

  it('applies a per-call timeout inside the transaction, then the transaction timeout again, and keeps the previous timeout after commit', async () => {
    await pool.withTransaction(
      async ({ execute }) => {
        await execute.query(SQL`SELECT pg_sleep(0.2)`, { timeoutMs: 1000 });

        await execute.command(SQL`SAVEPOINT before_sleep`);
        await assert.rejects(
          () => execute.query(SQL`SELECT pg_sleep(0.2)`),
          QueryCanceledError,
        );
        await execute.command(SQL`ROLLBACK TO SAVEPOINT before_sleep`);
      },
      { statementTimeoutMs: 50 },
    );

    assert.strictEqual(await showStatementTimeout(), '5s');
  });

  it('applies a per-call timeout inside the transaction, then the transaction timeout again, and keeps the previous timeout after rollback', async () => {
    await assert.rejects(
      () =>
        pool.withTransaction(
          async ({ execute }) => {
            await execute.query(SQL`SELECT pg_sleep(0.2)`, {
              timeoutMs: 1000,
            });
            await execute.query(SQL`SELECT pg_sleep(0.2)`);
          },
          { statementTimeoutMs: 50 },
        ),
      QueryCanceledError,
    );

    assert.strictEqual(await showStatementTimeout(), '5s');
  });

  it('keeps the previous timeout when COMMIT fails', async () => {
    await pool.execute.command(
      SQL`CREATE TABLE deferred_unique (id INT UNIQUE DEFERRABLE INITIALLY DEFERRED)`,
    );
    try {
      await assert.rejects(
        () =>
          pool.withTransaction(
            ({ execute }) =>
              execute.command(
                SQL`INSERT INTO deferred_unique (id) VALUES (1), (1)`,
              ),
            { statementTimeoutMs: 50 },
          ),
        UniqueConstraintError,
      );

      assert.strictEqual(await showStatementTimeout(), '5s');
    } finally {
      await pool.execute.command(SQL`DROP TABLE deferred_unique`);
    }
  });

  it('releases a usable connection and keeps the previous timeout when the handler swallows a failed statement', async () => {
    await pool.withTransaction(
      async ({ execute }) => {
        await assert.rejects(() => execute.query(SQL`SELECT 1/0`), DataError);
      },
      { statementTimeoutMs: 50 },
    );

    await pool.execute.query(SQL`SELECT 1`);
    assert.strictEqual(await showStatementTimeout(), '5s');
  });

  it('rejects an invalid statementTimeoutMs and leaves the connection usable', async () => {
    await assert.rejects(
      () =>
        pool.withTransaction(({ execute }) => execute.query(SQL`SELECT 1`), {
          statementTimeoutMs: -1,
        }),
      InvalidOperationError,
    );

    await pool.execute.query(SQL`SELECT 1`);
    assert.strictEqual(await showStatementTimeout(), '5s');
  });

  it('keeps the outer transaction timeout in a nested transaction with a different statementTimeoutMs', async () => {
    const nestedTimeout = await pool.withTransaction(
      (transaction) =>
        transaction.withTransaction(
          async ({ execute }) => {
            await execute.query(SQL`SELECT pg_sleep(0.2)`);
            return showStatementTimeout(execute);
          },
          { statementTimeoutMs: 50 },
        ),
      {
        statementTimeoutMs: 1000,
        allowNestedTransactions: true,
        useSavepoints: true,
      },
    );

    assert.strictEqual(nestedTimeout, '1s');
    assert.strictEqual(await showStatementTimeout(), '5s');
  });

  it('keeps the outer transaction timeout in a nested transaction without savepoints', async () => {
    const nestedTimeout = await pool.withTransaction(
      (transaction) =>
        transaction.withTransaction(
          async ({ execute }) => {
            await execute.query(SQL`SELECT pg_sleep(0.2)`);
            return showStatementTimeout(execute);
          },
          { statementTimeoutMs: 50 },
        ),
      { statementTimeoutMs: 1000, allowNestedTransactions: true },
    );

    assert.strictEqual(nestedTimeout, '1s');
    assert.strictEqual(await showStatementTimeout(), '5s');
  });

  it('keeps the outer transaction timeout after a nested transaction fails on a per-call timeout and rolls back to its savepoint', async () => {
    const outerTimeout = await pool.withTransaction(
      async (transaction) => {
        await assert.rejects(
          () =>
            transaction.withTransaction(({ execute }) =>
              execute.query(SQL`SELECT pg_sleep(0.2)`, { timeoutMs: 50 }),
            ),
          QueryCanceledError,
        );
        return showStatementTimeout(transaction.execute);
      },
      {
        statementTimeoutMs: 1000,
        allowNestedTransactions: true,
        useSavepoints: true,
      },
    );

    assert.strictEqual(outerTimeout, '1s');
    assert.strictEqual(await showStatementTimeout(), '5s');
  });
});
