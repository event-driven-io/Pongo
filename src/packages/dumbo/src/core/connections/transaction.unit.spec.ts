import assert from 'node:assert';
import { describe, it } from 'vitest';
import type { AnyConnection, Connection } from './connection';
import { InvalidOperationError } from '../errors';
import {
  assertRejectsDumboError,
  assertThrowsDumboError,
} from '../errors/errorAssertions';
import { Abort, type AbortContext } from '../taskProcessing';
import {
  type DatabaseTransaction,
  type DatabaseTransactionOptions,
  databaseTransaction,
  executeInTransaction,
  executeInNestedTransaction,
  transactionFactoryWithAmbientConnection,
  transactionFactoryWithAsyncAmbientConnection,
  transactionFactoryWithDbClient,
  transactionFactoryWithNewConnection,
  transactionNestingCounter,
} from './transaction';

const fakeDriverType = 'fake-driver' as unknown as AnyConnection['driverType'];

type TestConnection = Connection<
  TestConnection,
  AnyConnection['driverType'],
  unknown,
  DatabaseTransaction<TestConnection, DatabaseTransactionOptions>
>;

const abortedOptions = () => {
  const abortController = new AbortController();
  abortController.abort(new Error('transaction aborted'));
  return { abort: { signal: abortController.signal } };
};

const makeTransaction = (): DatabaseTransaction<
  TestConnection,
  DatabaseTransactionOptions
> => {
  const tx = {
    driverType: fakeDriverType,
    connection: undefined as unknown as TestConnection,
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
        transaction: DatabaseTransaction<
          TestConnection,
          DatabaseTransactionOptions
        >,
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
  } satisfies DatabaseTransaction<TestConnection, DatabaseTransactionOptions>;

  return tx;
};

const makeConnection = (): TestConnection =>
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
  }) satisfies TestConnection;

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

  it('throws an InvalidOperationError when decremented below zero', () => {
    const counter = transactionNestingCounter();

    assertThrowsDumboError(() => counter.decrement(), {
      errorType: 'InvalidOperationError',
      errorCode: 400,
      message: 'Transaction level is out of bounds',
    });
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

  it('rolls back instead of committing when aborted after begin', async () => {
    const controller = new AbortController();
    const abortReason = new Error('transaction aborted before commit');
    const { backend, calls } = makeBackend();
    let transactionFinished = 0;
    const tx = databaseTransaction(backend, {
      abort: { signal: controller.signal },
      onTransactionFinished: () => transactionFinished++,
    });

    await tx.begin();
    controller.abort(abortReason);

    await assert.rejects(
      () => tx.commit(),
      (error) => error === abortReason,
    );
    assert.deepStrictEqual(calls, ['begin', 'rollback']);
    assert.strictEqual(transactionFinished, 1);
  });
});

describe('executeInTransaction', () => {
  it('rolls back when the signal is aborted during a callback that ignores its context', async () => {
    const controller = new AbortController();
    const abortReason = new Error('transaction aborted during callback');
    const calls: string[] = [];
    const transaction = {
      begin: () => {
        calls.push('begin');
        return Promise.resolve();
      },
      commit: () => {
        calls.push('commit');
        return Promise.resolve();
      },
      rollback: (error?: unknown) => {
        calls.push('rollback');
        assert.strictEqual(error, abortReason);
        return Promise.resolve();
      },
    };

    await assert.rejects(
      () =>
        executeInTransaction(
          transaction,
          () => {
            controller.abort(abortReason);
            return Promise.resolve();
          },
          { abort: { signal: controller.signal } },
        ),
      (error) => error === abortReason,
    );
    assert.deepStrictEqual(calls, ['begin', 'rollback']);
  });

  it('does not roll back after commit fails', async () => {
    const commitError = new Error('commit failed');
    const calls: string[] = [];
    const transaction = {
      begin: () => {
        calls.push('begin');
        return Promise.resolve();
      },
      commit: () => {
        calls.push('commit');
        return Promise.reject(commitError);
      },
      rollback: () => {
        calls.push('rollback');
        return Promise.resolve();
      },
    };

    await assert.rejects(
      () => executeInTransaction(transaction, () => Promise.resolve()),
      (error) => error === commitError,
    );
    assert.deepStrictEqual(calls, ['begin', 'commit']);
  });

  it('attempts rollback once and preserves the callback error', async () => {
    const callbackError = new Error('callback failed');
    const calls: string[] = [];
    const transaction = {
      begin: () => {
        calls.push('begin');
        return Promise.resolve();
      },
      commit: () => {
        calls.push('commit');
        return Promise.resolve();
      },
      rollback: (error?: unknown) => {
        calls.push('rollback');
        assert.strictEqual(error, callbackError);
        return Promise.reject(new Error('rollback failed'));
      },
    };

    await assert.rejects(
      () =>
        executeInTransaction(transaction, () => Promise.reject(callbackError)),
      (error) => error === callbackError,
    );
    assert.deepStrictEqual(calls, ['begin', 'rollback']);
  });

  it('does not retry rollback when an explicit rollback result fails', async () => {
    const rollbackError = new Error('rollback failed');
    const calls: string[] = [];
    const transaction = {
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
        return Promise.reject(rollbackError);
      },
    };

    await assert.rejects(
      () =>
        executeInTransaction(transaction, () =>
          Promise.resolve({ success: false, result: undefined }),
        ),
      (error) => error === rollbackError,
    );
    assert.deepStrictEqual(calls, ['begin', 'rollback']);
  });
});

describe('transaction factories', () => {
  it('passes the caller abort signal to db-client transaction connect when work starts', async () => {
    const abortController = new AbortController();
    let observedSignal: AbortSignal | undefined;
    const factory = transactionFactoryWithDbClient<TestConnection>({
      connect: ({ abort }) => {
        observedSignal = abort.signal;
        return Promise.resolve(undefined);
      },
      initTransaction: () => makeTransaction(),
    });

    await factory.withTransaction(() => Promise.resolve(undefined), {
      abort: { signal: abortController.signal },
    });

    assert.strictEqual(observedSignal, abortController.signal);
  });

  it('fails fast before connecting in db-client withTransaction when the caller already aborted', async () => {
    let connectCalls = 0;
    let initTransactionCalls = 0;
    const factory = transactionFactoryWithDbClient<TestConnection>({
      connect: () => {
        connectCalls++;
        return Promise.resolve(undefined);
      },
      initTransaction: () => {
        initTransactionCalls++;
        return makeTransaction();
      },
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
    assert.strictEqual(initTransactionCalls, 0);
  });

  it('resolves default and per-call options before acquisition and callback execution', async () => {
    const defaultController = new AbortController();
    const perCallController = new AbortController();
    defaultController.abort(new Error('overridden default abort'));
    let acquisitionSignal: AbortSignal | undefined;
    let callbackSignal: AbortSignal | undefined;
    let resolvedOptions: DatabaseTransactionOptions | undefined;

    const factory = transactionFactoryWithDbClient<TestConnection>({
      connect: ({ abort }) => {
        acquisitionSignal = abort.signal;
        return Promise.resolve(undefined);
      },
      defaultOptions: {
        abort: { signal: defaultController.signal },
        allowNestedTransactions: false,
        readonly: true,
      },
      initTransaction: ({ options }) => {
        resolvedOptions = options;
        return makeTransaction();
      },
    });

    await factory.withTransaction(
      (_transaction, context) => {
        callbackSignal = context.abort.signal;
        return Promise.resolve();
      },
      {
        abort: { signal: perCallController.signal },
        allowNestedTransactions: true,
      },
    );

    assert.strictEqual(acquisitionSignal, perCallController.signal);
    assert.strictEqual(callbackSignal, perCallController.signal);
    assert.deepStrictEqual(resolvedOptions, {
      abort: { signal: perCallController.signal },
      allowNestedTransactions: true,
      readonly: true,
    });
  });

  it('rejects an already-aborted default before acquisition or transaction initialization', async () => {
    const controller = new AbortController();
    const abortReason = new Error('default transaction aborted');
    controller.abort(abortReason);
    let connectCalls = 0;
    let initTransactionCalls = 0;

    const factory = transactionFactoryWithDbClient<TestConnection>({
      connect: () => {
        connectCalls++;
        return Promise.resolve(undefined);
      },
      defaultOptions: { abort: { signal: controller.signal } },
      initTransaction: () => {
        initTransactionCalls++;
        return makeTransaction();
      },
    });

    assert.throws(
      () => factory.transaction(),
      (error) => error === abortReason,
    );
    await assert.rejects(
      () => factory.withTransaction(() => Promise.resolve()),
      (error) => error === abortReason,
    );
    assert.strictEqual(connectCalls, 0);
    assert.strictEqual(initTransactionCalls, 0);
  });

  it('rejects begin with the exact abort reason when aborted after transaction creation', async () => {
    const controller = new AbortController();
    const abortReason = new Error('aborted before begin');
    let backendBeginCalls = 0;

    const factory = transactionFactoryWithDbClient<TestConnection>({
      connect: () => Promise.resolve(undefined),
      initTransaction: ({ options, onTransactionFinished }) => ({
        ...makeTransaction(),
        ...databaseTransaction(
          {
            begin: () => {
              backendBeginCalls++;
              return Promise.resolve();
            },
            commit: () => Promise.resolve(),
            rollback: () => Promise.resolve(),
          },
          { abort: options.abort, onTransactionFinished },
        ),
      }),
    });

    const transaction = factory.transaction({
      abort: { signal: controller.signal },
    });
    controller.abort(abortReason);

    await assert.rejects(
      () => transaction.begin(),
      (error) => error === abortReason,
    );
    assert.strictEqual(backendBeginCalls, 0);
  });

  it('creates a fresh transaction with fresh options after root begin fails', async () => {
    const beginError = new Error('begin failed');
    const initializedOptions: DatabaseTransactionOptions[] = [];
    let transactionNumber = 0;

    const factory = transactionFactoryWithDbClient<TestConnection>({
      connect: () => Promise.resolve(undefined),
      initTransaction: ({ options, onTransactionFinished }) => {
        const currentTransactionNumber = transactionNumber++;
        initializedOptions.push(options);
        return {
          ...makeTransaction(),
          ...databaseTransaction(
            {
              begin: () =>
                currentTransactionNumber === 0
                  ? Promise.reject(beginError)
                  : Promise.resolve(),
              commit: () => Promise.resolve(),
              rollback: () => Promise.resolve(),
            },
            { abort: options.abort, onTransactionFinished },
          ),
        };
      },
    });

    const failedTransaction = factory.transaction({ readonly: true });
    await assert.rejects(
      () => failedTransaction.begin(),
      (error) => error === beginError,
    );

    const nextTransaction = factory.transaction({ readonly: false });
    assert.notStrictEqual(nextTransaction, failedTransaction);
    await nextTransaction.begin();
    await nextTransaction.rollback();
    assert.deepStrictEqual(initializedOptions, [
      { readonly: true },
      { readonly: false },
    ]);
  });

  for (const operation of ['commit', 'rollback'] as const) {
    it(`clears the active transaction and preserves a root ${operation} failure`, async () => {
      const operationError = new Error(`${operation} failed`);
      let transactionNumber = 0;

      const factory = transactionFactoryWithDbClient<TestConnection>({
        connect: () => Promise.resolve(undefined),
        initTransaction: ({ options, onTransactionFinished }) => {
          const currentTransactionNumber = transactionNumber++;
          return {
            ...makeTransaction(),
            ...databaseTransaction(
              {
                begin: () => Promise.resolve(),
                commit: () =>
                  operation === 'commit' && currentTransactionNumber === 0
                    ? Promise.reject(operationError)
                    : Promise.resolve(),
                rollback: () =>
                  operation === 'rollback' && currentTransactionNumber === 0
                    ? Promise.reject(operationError)
                    : Promise.resolve(),
              },
              { abort: options.abort, onTransactionFinished },
            ),
          };
        },
      });

      const failedTransaction = factory.transaction();
      await failedTransaction.begin();
      await assert.rejects(
        () => failedTransaction[operation](),
        (error) => error === operationError,
      );

      const nextTransaction = factory.transaction();
      assert.notStrictEqual(nextTransaction, failedTransaction);
      await nextTransaction.begin();
      await nextTransaction.rollback();
    });
  }

  it('keeps the root active after a rejected nested begin', async () => {
    const factory = transactionFactoryWithDbClient<TestConnection>({
      connect: () => Promise.resolve(undefined),
      initTransaction: ({ options, onTransactionFinished }) => ({
        ...makeTransaction(),
        ...databaseTransaction(
          {
            begin: () => Promise.resolve(),
            commit: () => Promise.resolve(),
            rollback: () => Promise.resolve(),
          },
          { abort: options.abort, onTransactionFinished },
        ),
      }),
    });

    const root = factory.transaction();
    await root.begin();
    await assert.rejects(() => root.begin(), InvalidOperationError);
    assert.strictEqual(factory.transaction(), root);
    await root.rollback();
  });

  for (const operation of ['commit', 'rollback'] as const) {
    it(`keeps the root active after a nested ${operation}`, async () => {
      const factory = transactionFactoryWithDbClient<TestConnection>({
        connect: () => Promise.resolve(undefined),
        defaultOptions: { allowNestedTransactions: true },
        initTransaction: ({ options, onTransactionFinished }) => ({
          ...makeTransaction(),
          ...databaseTransaction(
            {
              begin: () => Promise.resolve(),
              commit: () => Promise.resolve(),
              rollback: () => Promise.resolve(),
            },
            {
              abort: options.abort,
              allowNestedTransactions: true,
              onTransactionFinished,
            },
          ),
        }),
      });

      const root = factory.transaction();
      await root.begin();
      await root.begin();
      await root[operation]();
      assert.strictEqual(factory.transaction(), root);
      await root.rollback();
    });
  }

  it('does not let an older finish notification clear a newer active transaction', async () => {
    const finishNotifications: Array<() => void> = [];
    const factory = transactionFactoryWithDbClient<TestConnection>({
      connect: () => Promise.resolve(undefined),
      initTransaction: ({ options, onTransactionFinished }) => {
        finishNotifications.push(onTransactionFinished);
        return {
          ...makeTransaction(),
          ...databaseTransaction(
            {
              begin: () => Promise.resolve(),
              commit: () => Promise.resolve(),
              rollback: () => Promise.resolve(),
            },
            { abort: options.abort, onTransactionFinished },
          ),
        };
      },
    });

    const first = factory.transaction();
    await first.begin();
    await first.commit();
    const second = factory.transaction();

    finishNotifications[0]?.();

    assert.strictEqual(factory.transaction(), second);
    await second.begin();
    await second.rollback();
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

  it('passes the resolved per-call abort signal to the nested callback', async () => {
    const rootController = new AbortController();
    const perCallController = new AbortController();
    const { backend } = makeBackend();
    const tx = {
      ...databaseTransaction(backend, { allowNestedTransactions: true }),
      _transactionOptions: {
        abort: { signal: rootController.signal },
        allowNestedTransactions: true,
      },
    };

    await executeInNestedTransaction(
      tx,
      (_transaction, context) => {
        assert.strictEqual(context.abort.signal, perCallController.signal);
        return Promise.resolve();
      },
      { abort: { signal: perCallController.signal } },
    );
  });

  it('passes the root abort signal to the nested callback by default', async () => {
    const rootController = new AbortController();
    const { backend } = makeBackend();
    const tx = {
      ...databaseTransaction(backend, { allowNestedTransactions: true }),
      _transactionOptions: {
        abort: { signal: rootController.signal },
        allowNestedTransactions: true,
      },
    };

    await executeInNestedTransaction(tx, (_transaction, context) => {
      assert.strictEqual(context.abort.signal, rootController.signal);
      return Promise.resolve();
    });
  });
});

describe('transactionFactoryWithAsyncAmbientConnection', () => {
  const factory = () =>
    transactionFactoryWithAsyncAmbientConnection<AnyConnection>(
      fakeDriverType,
      () => Promise.resolve(makeConnection()),
    );

  it('reports reading the connection before begin() as an InvalidOperationError', () => {
    const tx = factory().transaction();

    assertThrowsDumboError(() => tx.connection, {
      errorType: 'InvalidOperationError',
      errorCode: 400,
      message: 'Transaction not started - call begin() first',
    });
  });

  it('reports committing before begin() as an InvalidOperationError', async () => {
    const tx = factory().transaction();

    await assertRejectsDumboError(() => tx.commit(), {
      errorType: 'InvalidOperationError',
      errorCode: 400,
      message: 'Transaction not started',
    });
  });
});
