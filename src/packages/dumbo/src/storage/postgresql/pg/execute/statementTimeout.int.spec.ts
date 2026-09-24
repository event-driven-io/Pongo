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
import { QueryCanceledError, single, SQL } from '../../../../core';
import { pgPool, type PgNativePool } from '../connections';

describe('PostgreSQL per-call statement timeout', () => {
  let postgres: StartedPostgreSqlContainer;
  let connectionString: string;
  let nativePool: pg.Pool;
  let pool: PgNativePool;

  const showStatementTimeout = async () =>
    (
      await single(
        pool.execute.query<{ statement_timeout: string }>(
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

  beforeEach(() => {
    nativePool = new pg.Pool({ connectionString, max: 1 });
    pool = pgPool({ connectionString, pool: nativePool });
  });

  afterEach(async () => {
    await pool.close();
    await nativePool.end();
  });

  describe('with a previous session value', () => {
    beforeEach(async () => {
      await pool.execute.command(SQL`SET statement_timeout = '5s'`);
    });

    it('query with timeoutMS keeps the previous statement timeout', async () => {
      await pool.execute.query(SQL`SELECT 1`, { timeoutMS: 1000 });

      assert.strictEqual(await showStatementTimeout(), '5s');
    });

    it('batchQuery with timeoutMS keeps the previous statement timeout', async () => {
      await pool.execute.batchQuery([SQL`SELECT 1`, SQL`SELECT 2`], {
        timeoutMS: 1000,
      });

      assert.strictEqual(await showStatementTimeout(), '5s');
    });

    it('command with timeoutMS keeps the previous statement timeout', async () => {
      await pool.execute.command(SQL`SELECT 1`, { timeoutMS: 1000 });

      assert.strictEqual(await showStatementTimeout(), '5s');
    });

    it('batchCommand with timeoutMS keeps the previous statement timeout', async () => {
      await pool.execute.batchCommand([SQL`SELECT 1`, SQL`SELECT 2`], {
        timeoutMS: 1000,
      });

      assert.strictEqual(await showStatementTimeout(), '5s');
    });

    it('a statement exceeding timeoutMS is cancelled and keeps the previous statement timeout', async () => {
      await assert.rejects(
        () => pool.execute.query(SQL`SELECT pg_sleep(0.2)`, { timeoutMS: 50 }),
        QueryCanceledError,
      );

      assert.strictEqual(await showStatementTimeout(), '5s');
    });
  });

  it('without a previous session value, the statement timeout stays disabled after a call', async () => {
    await pool.execute.query(SQL`SELECT 1`, { timeoutMS: 1000 });

    assert.strictEqual(await showStatementTimeout(), '0');
  });
});
