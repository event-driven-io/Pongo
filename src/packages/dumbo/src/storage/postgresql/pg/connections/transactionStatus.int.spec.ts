import {
  sharedPostgreSQLDatabase,
  type SharedPostgreSQLDatabase,
} from '@event-driven-io/testing/postgresql';
import assert from 'node:assert/strict';
import pg from 'pg';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { DataError, QueryCanceledError, SQL } from '../../../../core';
import { pgPool, type PgNativePool } from '.';

describe('PostgreSQL transaction recovery', () => {
  let database: SharedPostgreSQLDatabase;
  let nativePool: pg.Pool;
  let nativeClient: pg.PoolClient;
  let pool: PgNativePool;

  beforeAll(async () => {
    database = await sharedPostgreSQLDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    nativePool = new pg.Pool({
      connectionString: database.connectionString,
      max: 1,
    });
    pool = pgPool({
      connectionString: database.connectionString,
      pool: nativePool,
    });
    nativeClient = await nativePool.connect();
    await nativeClient.query('SELECT 1');
    assert.strictEqual(nativeClient.getTransactionStatus(), 'I');
    nativeClient.release();
  });

  afterEach(async () => {
    await pool.close();
    await nativePool.end();
  });

  const assertConnectionIsReusable = async () => {
    assert.strictEqual(nativePool.idleCount, 1);
    const client = await nativePool.connect();
    try {
      assert.strictEqual(client, nativeClient);
      assert.strictEqual(client.getTransactionStatus(), 'I');
      assert.deepStrictEqual((await client.query('SELECT 1 AS value')).rows, [
        { value: 1 },
      ]);
    } finally {
      client.release();
    }
  };

  it('returns the committed connection to the pool without an open transaction', async () => {
    await pool.withTransaction(async ({ execute }) => {
      assert.strictEqual(nativeClient.getTransactionStatus(), 'T');
      await execute.query(SQL`SELECT 1`);
      assert.strictEqual(nativeClient.getTransactionStatus(), 'T');
    });

    await assertConnectionIsReusable();
  });

  it('rolls back a failed statement before returning the connection to the pool', async () => {
    await assert.rejects(
      () =>
        pool.withTransaction(async ({ execute }) => {
          assert.strictEqual(nativeClient.getTransactionStatus(), 'T');
          try {
            await execute.query(SQL`SELECT 1 / 0`);
            assert.fail('The statement should fail');
          } catch (error) {
            // Query errors can arrive before ReadyForQuery updates pg's status.
            await expect
              .poll(() => nativeClient.getTransactionStatus())
              .toBe('E');
            throw error;
          }
        }),
      DataError,
    );

    await assertConnectionIsReusable();
  });

  it('returns an idle connection when the handler catches a failed statement', async () => {
    await pool.withTransaction(async ({ execute }) => {
      await assert.rejects(() => execute.query(SQL`SELECT 1 / 0`), DataError);
      await expect.poll(() => nativeClient.getTransactionStatus()).toBe('E');
    });

    await assertConnectionIsReusable();
  });

  it('recovers the outer transaction after rolling back a failed nested statement to its savepoint', async () => {
    await pool.withTransaction(
      async (transaction) => {
        assert.strictEqual(nativeClient.getTransactionStatus(), 'T');
        await assert.rejects(
          () =>
            transaction.withTransaction(async ({ execute }) => {
              assert.strictEqual(nativeClient.getTransactionStatus(), 'T');
              try {
                await execute.query(SQL`SELECT 1 / 0`);
                assert.fail('The statement should fail');
              } catch (error) {
                await expect
                  .poll(() => nativeClient.getTransactionStatus())
                  .toBe('E');
                throw error;
              }
            }),
          DataError,
        );

        assert.strictEqual(nativeClient.getTransactionStatus(), 'T');
        const result = await transaction.execute.query<{ value: number }>(
          SQL`SELECT 1 AS value`,
        );
        assert.deepStrictEqual(result.rows, [{ value: 1 }]);
      },
      { allowNestedTransactions: true, useSavepoints: true },
    );

    await assertConnectionIsReusable();
  });

  it('rolls back a canceled statement before returning the connection to the pool', async () => {
    await assert.rejects(
      () =>
        pool.withTransaction(
          async ({ execute }) => {
            try {
              await execute.query(SQL`SELECT pg_sleep(0.2)`);
              assert.fail('The statement should time out');
            } catch (error) {
              await expect
                .poll(() => nativeClient.getTransactionStatus())
                .toBe('E');
              throw error;
            }
          },
          { statementTimeoutMS: 50 },
        ),
      QueryCanceledError,
    );

    await assertConnectionIsReusable();
  });
});
