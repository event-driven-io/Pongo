import assert from 'assert';
import { describe, it } from 'vitest';
import { DumboError } from '../errors';
import {
  BatchCommandNoChangesError,
  sqlExecutor,
  type DbSQLExecutor,
} from './execute';

describe('BatchCommandNoChangesError', () => {
  it('signals a conflict with the 409 status code', () => {
    assert.strictEqual(new BatchCommandNoChangesError(0).errorCode, 409);
  });

  it('reports the index of the batch statement that affected no rows', () => {
    assert.strictEqual(new BatchCommandNoChangesError(3).statementIndex, 3);
  });

  it('has a dedicated error type instead of the generic DumboError type', () => {
    assert.strictEqual(
      new BatchCommandNoChangesError(0).errorType,
      'BatchCommandNoChangesError',
    );
  });

  it('is distinguishable from an arbitrary failure wrapped as a generic DumboError', () => {
    const noChanges = new BatchCommandNoChangesError(0);
    const wrappedFailure = new DumboError({ errorCode: 500, message: 'boom' });

    assert.notStrictEqual(noChanges.errorType, wrappedFailure.errorType);
  });
});

describe('SQLExecutor cancellation', () => {
  it('rejects query immediately when signal is already aborted', async () => {
    let queryWasCalled = false;
    const executor = sqlExecutor(
      {
        driverType: 'test:test',
        formatter: undefined as never,
        query: () => {
          queryWasCalled = true;
          return Promise.resolve({ rowCount: 0, rows: [] });
        },
        batchQuery: () => Promise.resolve([]),
        command: () => Promise.resolve({ rowCount: 0, rows: [] }),
        batchCommand: () => Promise.resolve([]),
      } satisfies DbSQLExecutor,
      {
        connect: () => Promise.resolve({}),
      },
    );
    const abortController = new AbortController();
    abortController.abort(new Error('abort query'));

    await assert.rejects(
      () =>
        executor.query({} as never, {
          cancellation: { signal: abortController.signal },
        }),
      /abort query/,
    );
    assert.strictEqual(queryWasCalled, false);
  });

  it('rejects a running command when signal aborts', async () => {
    const abortController = new AbortController();
    const commandStarted = Promise.withResolvers<void>();
    const executor = sqlExecutor(
      {
        driverType: 'test:test',
        formatter: undefined as never,
        query: () => Promise.resolve({ rowCount: 0, rows: [] }),
        batchQuery: () => Promise.resolve([]),
        command: async () => {
          commandStarted.resolve();
          await new Promise(() => {});
          return { rowCount: 0, rows: [] };
        },
        batchCommand: () => Promise.resolve([]),
      } satisfies DbSQLExecutor,
      {
        connect: () => Promise.resolve({}),
      },
    );

    const command = executor.command({} as never, {
      cancellation: { signal: abortController.signal },
    });
    await commandStarted.promise;
    abortController.abort(new Error('abort command'));

    await assert.rejects(command, /abort command/);
  });
});
