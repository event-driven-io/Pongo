import assert from 'node:assert';
import { describe, it } from 'vitest';
import type { AnyConnection } from './connection';
import { InvalidOperationError } from '../errors';
import { Abort, type AbortContext } from '../taskProcessing';
import {
  type AnyDatabaseTransaction,
  type DatabaseTransactionOptions,
  databaseTransaction,
  executeInNestedTransaction,
  transactionFactoryWithAmbientConnection,
  transactionFactoryWithAsyncAmbientConnection,
  transactionFactoryWithDbClient,
  transactionFactoryWithNewConnection,
  transactionNestingCounter,
} from './transaction';

const fakeDriverType = 'fake-driver' as unknown as AnyConnection['driverType'];

const abortedOptions = () => {
  const abortController = new AbortController();
  abortController.abort(new Error('transaction aborted'));
  return { abort: { signal: abortController.signal } };
};

const makeTransaction = (): AnyDatabaseTransaction => {
  const tx = {
    driverType: fakeDriverType,
    connection: undefined as unknown as AnyConnection,
    execute: {
      query: () => Promise.resolve({ rowCount: 0, rows: [] }),
      batchQuery: () => Promise.resolve([]),
      command: () => Promise.resolve({ rowCount: 0, rows: [] }),
      batchCommand: () => Promise.resolve([]),
    },
    begin: () => Promise.resolve(),
    commit: () => Promise.resolve(),
    rollback: () => Promise.resolve(),
    withTransaction: async <Result>(
      handle: (
        transaction: AnyDatabaseTransaction,
        context: AbortContext,
      ) => Promise<Result | { success: boolean; result: Result }>,
      options?: DatabaseTransactionOptions,
    ): Promise<Result> => {
      Abort.throwIfAborted(options);
      const result = await handle(tx, { abort: Abort.from(options) });
      return typeof result === 'object' &&
        result !== null &&
        'success' in result &&
        'result' in result
        ? result.result
        : result;
    },
    _transactionOptions: {},
  } satisfies AnyDatabaseTransaction;

  return tx;
};

const makeConnection = (): AnyConnection =>
  ({
    driverType: fakeDriverType,
    open: () => Promise.resolve(undefined),
    close: () => Promise.resolve(),
    execute: {
      query: () => Promise.resolve({ rowCount: 0, rows: [] }),
      batchQuery: () => Promise.resolve([]),
      command: () => Promise.resolve({ rowCount: 0, rows: [] }),
      batchCommand: () => Promise.resolve([]),
    },
    transaction: () => makeTransaction(),
    withTransaction: makeTransaction().withTransaction,
    _transactionType: makeTransaction(),
  }) satisfies AnyConnection;

describe('transactionNestingCounter', () => {
  it('starts at level 0', () => {
    const counter = transactionNestingCounter();
    assert.strictEqual(counter.level, 0);
  });

  it('increments, decrements, and resets', () => {
    const counter = transactionNestingCounter();
    counter.increment();
    counter.increment();
    assert.strictEqual(counter.level, 2);
    counter.decrement();
    assert.strictEqual(counter.level, 1);
    counter.reset();
    assert.strictEqual(counter.level, 0);
  });

  it('throws when decremented below zero', () => {
    const counter = transactionNestingCounter();
    assert.throws(() => counter.decrement(), /out of bounds/i);
  });
});

const makeBackend = () => {
  const calls: string[] = [];
  return {
    calls,
    backend: {
      begin: () => {
        calls.push('begin');
        return Promise.resolve();
      },
      commit: () => {
        calls.push('commit');
        return Promise.resolve();
      },
      rollback: () => {
        calls.push('rollback');
        return Promise.resolve();
      },
      savepoint: (level: number) => {
        calls.push(`savepoint:${level}`);
        return Promise.resolve();
      },
      releaseSavepoint: (level: number) => {
        calls.push(`release:${level}`);
        return Promise.resolve();
      },
      rollbackToSavepoint: (level: number) => {
        calls.push(`rollbackTo:${level}`);
        return Promise.resolve();
      },
    },
  };
};

describe('databaseTransaction', () => {
  it('runs backend begin and commit for a single transaction', async () => {
    const { backend, calls } = makeBackend();
    const tx = databaseTransaction(backend);

    await tx.begin();
    await tx.commit();

    assert.deepStrictEqual(calls, ['begin', 'commit']);
  });

  it('rejects nested begin when nested transactions are disabled', async () => {
    const { backend, calls } = makeBackend();
    const tx = databaseTransaction(backend);

    await tx.begin();
    await assert.rejects(
      () => tx.begin(),
      (err) =>
        err instanceof InvalidOperationError &&
        /allowNestedTransactions/.test(err.message),
    );

    assert.deepStrictEqual(calls, ['begin']);
  });

  it('treats nested commit and rollback as backend no-ops without savepoints', async () => {
    const { backend, calls } = makeBackend();
    const tx = databaseTransaction(backend, {
      allowNestedTransactions: true,
    });

    await tx.begin();
    await tx.begin();
    await tx.commit();
    await tx.commit();
    await tx.begin();
    await tx.begin();
    await tx.rollback();
    await tx.rollback();

    assert.deepStrictEqual(calls, ['begin', 'commit', 'begin', 'rollback']);
  });

  it('uses savepoints for nested commit and rollback when enabled', async () => {
    const { backend, calls } = makeBackend();
    const tx = databaseTransaction(backend, {
      allowNestedTransactions: true,
      useSavepoints: true,
    });

    await tx.begin();
    await tx.begin();
    await tx.begin();
    await tx.commit();
    await tx.rollback();
    await tx.commit();

    assert.deepStrictEqual(calls, [
      'begin',
      'savepoint:2',
      'savepoint:3',
      'release:3',
      'rollbackTo:2',
      'commit',
    ]);
  });

  it('skips savepoint calls when hooks are not provided', async () => {
    const calls: string[] = [];
    const tx = databaseTransaction(
      {
        begin: () => {
          calls.push('begin');
          return Promise.resolve();
        },
        commit: () => {
          calls.push('commit');
          return Promise.resolve();
        },
        rollback: () => {
          calls.push('rollback');
          return Promise.resolve();
        },
      },
      { allowNestedTransactions: true, useSavepoints: true },
    );

    await tx.begin();
    await tx.begin();
    await tx.commit();
    await tx.commit();

    assert.deepStrictEqual(calls, ['begin', 'commit']);
  });
});

describe('transaction factories', () => {
  it('passes the caller abort signal to db-client transaction connect when work starts', async () => {
    const abortController = new AbortController();
    let observedSignal: AbortSignal | undefined;
    const factory = transactionFactoryWithDbClient<AnyConnection>(
      ({ abort }) => {
        observedSignal = abort.signal;
        return Promise.resolve(undefined);
      },
      () => makeTransaction(),
    );

    await factory.withTransaction(() => Promise.resolve(undefined), {
      abort: { signal: abortController.signal },
    });

    assert.strictEqual(observedSignal, abortController.signal);
  });

  it('fails fast before connecting in db-client withTransaction when the caller already aborted', async () => {
    let connectCalls = 0;
    let initTransactionCalls = 0;
    const factory = transactionFactoryWithDbClient<AnyConnection>(
      () => {
        connectCalls++;
        return Promise.resolve(undefined);
      },
      () => {
        initTransactionCalls++;
        return makeTransaction();
      },
    );

    await assert.rejects(
      () =>
        factory.withTransaction(
          () => Promise.resolve(undefined),
          abortedOptions(),
        ),
      /transaction aborted/,
    );

    assert.strictEqual(connectCalls, 0);
    assert.strictEqual(initTransactionCalls, 0);
  });

  it('fails fast before creating a new connection when transaction() receives an already aborted caller', () => {
    let connectCalls = 0;
    const factory = transactionFactoryWithNewConnection<AnyConnection>(() => {
      connectCalls++;
      return makeConnection();
    });

    assert.throws(
      () => factory.transaction(abortedOptions()),
      /transaction aborted/,
    );
    assert.strictEqual(connectCalls, 0);
  });

  it('fails fast before creating a new connection in withTransaction when the caller already aborted', async () => {
    let connectCalls = 0;
    const factory = transactionFactoryWithNewConnection<AnyConnection>(() => {
      connectCalls++;
      return makeConnection();
    });

    await assert.rejects(
      () =>
        factory.withTransaction(
          () => Promise.resolve(undefined),
          abortedOptions(),
        ),
      /transaction aborted/,
    );
    assert.strictEqual(connectCalls, 0);
  });

  it('fails fast before resolving the ambient connection when transaction() receives an already aborted caller', () => {
    let connectCalls = 0;
    const factory = transactionFactoryWithAmbientConnection<AnyConnection>(
      () => {
        connectCalls++;
        return makeConnection();
      },
    );

    assert.throws(
      () => factory.transaction(abortedOptions()),
      /transaction aborted/,
    );
    assert.strictEqual(connectCalls, 0);
  });

  it('fails fast before resolving the ambient connection in withTransaction when the caller already aborted', async () => {
    let connectCalls = 0;
    const factory = transactionFactoryWithAmbientConnection<AnyConnection>(
      () => {
        connectCalls++;
        return makeConnection();
      },
    );

    await assert.rejects(
      () =>
        factory.withTransaction(
          () => Promise.resolve(undefined),
          abortedOptions(),
        ),
      /transaction aborted/,
    );
    assert.strictEqual(connectCalls, 0);
  });

  it('fails fast before acquiring an async ambient connection in withTransaction when the caller already aborted', async () => {
    let connectCalls = 0;
    const factory = transactionFactoryWithAsyncAmbientConnection<AnyConnection>(
      fakeDriverType,
      () => {
        connectCalls++;
        return Promise.resolve(makeConnection());
      },
    );

    await assert.rejects(
      () =>
        factory.withTransaction(
          () => Promise.resolve(undefined),
          abortedOptions(),
        ),
      /transaction aborted/,
    );
    assert.strictEqual(connectCalls, 0);
  });

  it('does not create an async ambient transaction for an aborted caller', () => {
    let connectCalls = 0;
    const factory = transactionFactoryWithAsyncAmbientConnection<AnyConnection>(
      fakeDriverType,
      () => {
        connectCalls++;
        return Promise.resolve(makeConnection());
      },
    );

    assert.throws(
      () => factory.transaction(abortedOptions()),
      /transaction aborted/,
    );
    assert.strictEqual(connectCalls, 0);
  });
});

describe('executeInNestedTransaction', () => {
  it('rejects when nested transactions are disabled on the transaction object', async () => {
    const { backend } = makeBackend();
    const tx = {
      ...databaseTransaction(backend),
      _transactionOptions: { allowNestedTransactions: false },
    };

    await assert.rejects(
      () => executeInNestedTransaction(tx, () => Promise.resolve(undefined)),
      (err) =>
        err instanceof InvalidOperationError &&
        /allowNestedTransactions/.test(err.message),
    );
  });

  it('reports caller abort before nested-transaction policy when the caller is already aborted', async () => {
    const { backend } = makeBackend();
    const tx = {
      ...databaseTransaction(backend),
      _transactionOptions: { allowNestedTransactions: false },
    };

    await assert.rejects(
      () =>
        executeInNestedTransaction(
          tx,
          () => Promise.resolve(undefined),
          abortedOptions() as DatabaseTransactionOptions,
        ),
      /transaction aborted/,
    );
  });
});
