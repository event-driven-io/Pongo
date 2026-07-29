import assert from 'node:assert';
import * as fs from 'node:fs';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { SQL } from '../../../../core';
import { sqlite3Pool, type Sqlite3Pool } from '../../sqlite3';

const withDeadline = { timeout: 30000 };

const beforeDeadline = async <Result>(
  work: Promise<Result>,
  ms = 1000,
): Promise<Result | 'timed out'> => {
  let timeoutId: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      work,
      new Promise<'timed out'>((resolve) => {
        timeoutId = setTimeout(() => resolve('timed out'), ms);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

describe('SQLite pool reentrancy', () => {
  const fileName = 'reentrancy-test.db';

  const cleanupDb = (file: string) => {
    try {
      fs.unlinkSync(file);
      fs.unlinkSync(`${file}-shm`);
      fs.unlinkSync(`${file}-wal`);
    } catch {
      // ignore
    }
  };

  beforeAll(() => cleanupDb(fileName));
  afterAll(() => cleanupDb(fileName));

  const poolShapes: [string, () => Sqlite3Pool][] = [
    ['singleton pool (in-memory)', () => sqlite3Pool({ fileName: ':memory:' })],
    ['dual pool (file-backed)', () => sqlite3Pool({ fileName })],
  ];

  for (const [shape, createPool] of poolShapes) {
    describe(shape, () => {
      it(
        'runs a query on a connection acquired inside another connection',
        withDeadline,
        async () => {
          const pool = createPool();

          try {
            const result = await beforeDeadline(
              pool.withConnection(() =>
                pool.withConnection((connection) =>
                  connection.execute.query(SQL`SELECT 1 AS one`),
                ),
              ),
            );

            assert.notStrictEqual(result, 'timed out');
          } finally {
            await pool.close();
          }
        },
      );

      it(
        'runs a transaction opened inside a connection',
        withDeadline,
        async () => {
          const pool = createPool();

          try {
            const result = await beforeDeadline(
              pool.withConnection(() =>
                pool.withTransaction(() =>
                  Promise.resolve({ success: true as const, result: 'done' }),
                ),
              ),
            );

            assert.strictEqual(result, 'done');
          } finally {
            await pool.close();
          }
        },
      );

      it(
        'runs a query on a connection acquired inside a transaction',
        withDeadline,
        async () => {
          const pool = createPool();

          try {
            const result = await beforeDeadline(
              pool.withTransaction(() =>
                pool
                  .withConnection((connection) =>
                    connection.execute.query(SQL`SELECT 1 AS one`),
                  )
                  .then((result) => ({ success: true as const, result })),
              ),
            );

            assert.notStrictEqual(result, 'timed out');
          } finally {
            await pool.close();
          }
        },
      );
    });
  }
});
