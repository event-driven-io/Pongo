import assert from 'node:assert';
import { describe, it } from 'vitest';
import type { DbSQLExecutor } from '../execute';
import { jsonSerializer } from '../serializer';
import { SQLFormatter } from '../sql';
import type { AbortContext } from '../taskProcessing';
import {
  createAmbientConnection,
  createConnection,
  createSingletonConnection,
  createTransientConnection,
  type AnyConnection,
  type ConnectionTransactionFactory,
} from './connection';
import { transactionFactoryWithDbClient } from './transaction';

const fakeDriverType = 'fake-driver' as unknown as AnyConnection['driverType'];

const abortedContext = (): AbortContext => {
  const abortController = new AbortController();
  abortController.abort(new Error('connection aborted'));
  return { abort: { signal: abortController.signal } };
};

const executor = () =>
  ({
    driverType: fakeDriverType,
    query: () => Promise.resolve({ rowCount: 0, rows: [] }),
    batchQuery: () => Promise.resolve([]),
    command: () => Promise.resolve({ rowCount: 0, rows: [] }),
    batchCommand: () => Promise.resolve([]),
    formatter: SQLFormatter({}),
  }) satisfies DbSQLExecutor;

const initTransaction = (_connection: () => AnyConnection) => () => {
  const transaction = {
    driverType: fakeDriverType,
    connection: undefined,
    execute: {
      query: () => Promise.resolve({ rowCount: 0, rows: [] }),
      batchQuery: () => Promise.resolve([]),
      command: () => Promise.resolve({ rowCount: 0, rows: [] }),
      batchCommand: () => Promise.resolve([]),
    },
    begin: () => Promise.resolve(),
    commit: () => Promise.resolve(),
    rollback: () => Promise.resolve(),
    withTransaction: () => Promise.reject(new Error('not implemented')),
    _transactionOptions: {},
  };

  return transaction;
};

const transactionFactory: ConnectionTransactionFactory<AnyConnection> = (
  connect,
  connection,
) =>
  transactionFactoryWithDbClient<AnyConnection>({
    connect,
    initTransaction: initTransaction(connection),
  });

const connectionFactories: Array<[string, () => AnyConnection]> = [
  [
    'ambient',
    () =>
      createAmbientConnection<AnyConnection>({
        driverType: fakeDriverType,
        client: undefined,
        executor,
        transactionFactory,
        serializer: jsonSerializer(),
      }),
  ],
  [
    'singleton',
    () =>
      createSingletonConnection<AnyConnection>({
        driverType: fakeDriverType,
        connect: () => Promise.resolve(undefined),
        close: () => Promise.resolve(),
        executor,
        transactionFactory,
        serializer: jsonSerializer(),
      }),
  ],
  [
    'transient',
    () =>
      createTransientConnection<AnyConnection>({
        driverType: fakeDriverType,
        open: () => Promise.resolve(undefined),
        close: () => Promise.resolve(),
        executor,
        transactionFactory,
        serializer: jsonSerializer(),
      }),
  ],
  [
    'regular',
    () =>
      createConnection<AnyConnection>({
        driverType: fakeDriverType,
        connect: () => Promise.resolve(undefined),
        close: () => Promise.resolve(),
        executor,
        transactionFactory,
        serializer: jsonSerializer(),
      }),
  ],
];

describe('connection factories', () => {
  it.each(connectionFactories)(
    'uses a supplied transaction strategy for a %s connection',
    async (_name, create) => {
      const connection = create();

      const result = await connection.withTransaction(() =>
        Promise.resolve('completed'),
      );

      assert.strictEqual(result, 'completed');
    },
  );

  it('does not hand out an ambient connection when the caller has already aborted', () => {
    const connection = createAmbientConnection<AnyConnection>({
      driverType: fakeDriverType,
      client: undefined,
      executor,
      transactionFactory,
      serializer: jsonSerializer(),
    });

    assert.throws(() => connection.open(abortedContext()), {
      message: 'connection aborted',
    });
  });

  it('does not reuse an already-open singleton connection for an aborted caller', async () => {
    let connectCalls = 0;
    const connection = createSingletonConnection<AnyConnection>({
      driverType: fakeDriverType,
      connect: () => {
        connectCalls++;
        return Promise.resolve(undefined);
      },
      close: () => Promise.resolve(),
      executor,
      transactionFactory,
      serializer: jsonSerializer(),
    });

    await connection.open();
    await assert.rejects(() => connection.open(abortedContext()), {
      message: 'connection aborted',
    });

    assert.strictEqual(connectCalls, 1);
  });

  it('does not open a transient connection for an aborted caller', () => {
    let openCalls = 0;
    const connection = createTransientConnection<AnyConnection>({
      driverType: fakeDriverType,
      open: () => {
        openCalls++;
        return Promise.resolve(undefined);
      },
      close: () => Promise.resolve(),
      executor,
      transactionFactory,
      serializer: jsonSerializer(),
    });

    assert.throws(() => connection.open(abortedContext()), {
      message: 'connection aborted',
    });

    assert.strictEqual(openCalls, 0);
  });

  it('does not reuse an already-open lazy connection for an aborted caller', async () => {
    let connectCalls = 0;
    const connection = createConnection<AnyConnection>({
      driverType: fakeDriverType,
      connect: () => {
        connectCalls++;
        return Promise.resolve(undefined);
      },
      close: () => Promise.resolve(),
      executor,
      transactionFactory,
      serializer: jsonSerializer(),
    });

    await connection.open();
    await assert.rejects(() => connection.open(abortedContext()), {
      message: 'connection aborted',
    });

    assert.strictEqual(connectCalls, 1);
  });
});
