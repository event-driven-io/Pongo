import assert from 'assert';
import { describe, it } from 'vitest';
import { DumboError } from '../errors';
import { Abort } from '../taskProcessing';
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

describe('SQLExecutor abort', () => {
  it('rejects query immediately when signal is already aborted', async () => {
    let queryWasCalled = false;
    let connectWasCalled = false;
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
        connect: () => {
          connectWasCalled = true;
          return Promise.resolve({});
        },
      },
    );
    const abortController = new AbortController();
    abortController.abort(new Error('abort query'));

    await assert.rejects(
      () =>
        executor.query({} as never, {
          abort: { signal: abortController.signal },
        }),
      /abort query/,
    );
    assert.strictEqual(connectWasCalled, false);
    assert.strictEqual(queryWasCalled, false);
  });

  it('passes the caller abort signal to connect', async () => {
    const abortController = new AbortController();
    let observedSignal: AbortSignal | undefined;
    const executor = sqlExecutor(
      {
        driverType: 'test:test',
        formatter: undefined as never,
        query: () => Promise.resolve({ rowCount: 0, rows: [] }),
        batchQuery: () => Promise.resolve([]),
        command: () => Promise.resolve({ rowCount: 0, rows: [] }),
        batchCommand: () => Promise.resolve([]),
      } satisfies DbSQLExecutor,
      {
        connect: ({ abort }) => {
          observedSignal = abort.signal;
          return Promise.resolve({});
        },
      },
    );

    await executor.query({} as never, {
      abort: { signal: abortController.signal },
    });

    assert.strictEqual(observedSignal, abortController.signal);
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
        command: async (_client, _sql, options) => {
          commandStarted.resolve();
          if (!options?.abort) {
            throw new Error('abort options were not passed to command');
          }
          const { abort } = options;
          await new Promise<void>((_resolve, reject) => {
            abort.signal.addEventListener(
              'abort',
              () => reject(Abort.reason(abort)),
              { once: true },
            );
          });
          return { rowCount: 0, rows: [] };
        },
        batchCommand: () => Promise.resolve([]),
      } satisfies DbSQLExecutor,
      {
        connect: () => Promise.resolve({}),
      },
    );

    const command = executor.command({} as never, {
      abort: { signal: abortController.signal },
    });
    await commandStarted.promise;
    abortController.abort(new Error('abort command'));

    await assert.rejects(command, /abort command/);
  });
});
