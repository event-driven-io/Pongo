import assert from 'node:assert';
import { describe, it } from 'vitest';
import type { QueryResult, QueryResultRow } from '../../../../core';
import { SQLite3DriverType, type SQLite3Connection } from '../connections';
import { sqlite3SingletonPool } from './singletonPool';

const queryResult = <
  Result extends QueryResultRow = QueryResultRow,
>(): QueryResult<Result> => ({ rowCount: 0, rows: [] });

const fakeConnection = (
  command: SQLite3Connection['execute']['command'],
): SQLite3Connection =>
  ({
    close: () => Promise.resolve(),
    driverType: SQLite3DriverType,
    execute: {
      batchCommand: () => Promise.resolve([]),
      batchQuery: () => Promise.resolve([]),
      command,
      query: () => Promise.resolve(queryResult()),
    },
    open: () => Promise.resolve(undefined),
    transaction: () => undefined,
    withTransaction: () => Promise.resolve(undefined),
  }) as unknown as SQLite3Connection;

describe('sqlite3SingletonPool', () => {
  it('does not start queued writer work when the caller aborts while waiting', async () => {
    const firstCommandStarted = Promise.withResolvers<void>();
    const firstCommandCanFinish = Promise.withResolvers<void>();
    let commandCallCount = 0;
    const command: SQLite3Connection['execute']['command'] = async <
      Result extends QueryResultRow = QueryResultRow,
    >() => {
      commandCallCount++;
      if (commandCallCount === 1) {
        firstCommandStarted.resolve();
        await firstCommandCanFinish.promise;
      }
      return queryResult<Result>();
    };
    const connection = fakeConnection(command);
    const pool = sqlite3SingletonPool({
      driverType: SQLite3DriverType,
      getConnection: () => connection,
    });
    const abortController = new AbortController();

    const activeCommand = pool.execute.command({} as never);
    await firstCommandStarted.promise;

    const queuedCommand = pool.execute.command({} as never, {
      abort: { signal: abortController.signal },
    });
    abortController.abort(new Error('queued writer aborted'));

    await assert.rejects(queuedCommand, /queued writer aborted/);

    firstCommandCanFinish.resolve();
    await activeCommand;
    await pool.close();

    assert.strictEqual(commandCallCount, 1);
  });
});
