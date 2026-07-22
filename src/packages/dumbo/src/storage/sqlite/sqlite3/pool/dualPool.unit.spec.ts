import assert from 'node:assert';
import { describe, it } from 'vitest';
import {
  Abort,
  type AbortContext,
  type QueryResult,
  type QueryResultRow,
} from '../../../../core';
import type { SQLiteClient, SQLiteConnectionOptions } from '../../core';
import { SQLite3DriverType, type SQLite3Connection } from '../connections';
import { sqliteDualConnectionPool } from './dualPool';

type FakeSQLiteConnectionOptions = SQLiteConnectionOptions<SQLite3Connection> &
  Record<string, unknown>;

const queryResult = <
  Result extends QueryResultRow = QueryResultRow,
>(): QueryResult<Result> => ({ rowCount: 0, rows: [] });

const fakeClient = (): SQLiteClient => ({
  batchCommand: () => Promise.resolve([]),
  batchQuery: () => Promise.resolve([]),
  close: () => Promise.resolve(),
  command: () => Promise.resolve(queryResult()),
  connect: () => Promise.resolve(),
  query: () => Promise.resolve(queryResult()),
});

const fakeConnection = (options?: {
  open?: SQLite3Connection['open'];
}): SQLite3Connection =>
  ({
    close: () => Promise.resolve(),
    driverType: SQLite3DriverType,
    execute: {
      batchCommand: () => Promise.resolve([]),
      batchQuery: () => Promise.resolve([]),
      command: () => Promise.resolve(queryResult()),
      query: () => Promise.resolve(queryResult()),
    },
    open: options?.open ?? (() => Promise.resolve(fakeClient())),
    transaction: () => undefined,
    withTransaction: () => Promise.resolve(undefined),
  }) as unknown as SQLite3Connection;

describe('sqliteDualConnectionPool', () => {
  it('lets database initialization observe caller abort while opening the initial connection', async () => {
    const abortController = new AbortController();
    let initOpenSignal: AbortSignal | undefined;
    const initOpenStarted = Promise.withResolvers<void>();
    const pool = sqliteDualConnectionPool<
      SQLite3Connection,
      FakeSQLiteConnectionOptions
    >({
      driverType: SQLite3DriverType,
      sqliteConnectionFactory: (options) =>
        fakeConnection({
          open: async (context?: AbortContext) => {
            if (options.skipDatabasePragmas !== false) return fakeClient();

            assert.ok(context, 'Initialization should receive abort context');
            initOpenSignal = context.abort.signal;
            initOpenStarted.resolve();

            return await new Promise<SQLiteClient>((_resolve, reject) => {
              context.abort.signal.addEventListener(
                'abort',
                () => reject(Abort.reason(context.abort)),
                { once: true },
              );
            });
          },
        }),
    });

    const query = pool.execute.query({} as never, {
      abort: { signal: abortController.signal },
    });

    await initOpenStarted.promise;
    abortController.abort(new Error('abort sqlite initialization'));

    await assert.rejects(query, /abort sqlite initialization/);
    assert.strictEqual(initOpenSignal?.aborted, true);

    await pool.close({ force: true });
  });
});
