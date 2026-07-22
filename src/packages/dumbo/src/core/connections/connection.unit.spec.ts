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
  type InitTransaction,
} from './connection';

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

const initTransaction: InitTransaction<AnyConnection> = () => () => {
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

describe('connection factories', () => {
  it('does not hand out an ambient connection when the caller has already aborted', () => {
    const connection = createAmbientConnection<AnyConnection>({
      driverType: fakeDriverType,
      client: undefined,
      executor,
      initTransaction,
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
      initTransaction,
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
      initTransaction,
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
      initTransaction,
      serializer: jsonSerializer(),
    });

    await connection.open();
    await assert.rejects(() => connection.open(abortedContext()), {
      message: 'connection aborted',
    });

    assert.strictEqual(connectCalls, 1);
  });
});
