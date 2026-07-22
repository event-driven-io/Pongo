import assert from 'node:assert';
import { describe, it } from 'vitest';
import type { AnyConnection } from './connection';
import {
  createAmbientConnectionPool,
  createBoundedConnectionPool,
  createConnectionPool,
  createSingletonConnectionPool,
} from './pool';

type FakeConnection = AnyConnection & { id: number; closed: boolean };

const fakeDriverType = 'fake-driver' as unknown as AnyConnection['driverType'];

const makeFakeConnection = (
  id: number,
  overrides?: Partial<AnyConnection>,
): FakeConnection => {
  const conn = {
    id,
    closed: false,
    driverType: fakeDriverType,
    open: () => Promise.resolve(undefined),
    close: () => {
      conn.closed = true;
      return Promise.resolve();
    },
    execute: {
      query: () => Promise.resolve({ rowCount: 0, rows: [] }),
      batchQuery: () => Promise.resolve([]),
      command: () => Promise.resolve({ rowCount: 0, rows: [] }),
      batchCommand: () => Promise.resolve([]),
    },
    transaction: () => undefined,
    withTransaction: async <Result>(
      handle: (
        tx: unknown,
      ) => Promise<Result | { success: boolean; result: Result }>,
    ): Promise<Result> => {
      const outcome = await handle({ id: `tx-${id}` });
      if (
        outcome !== null &&
        typeof outcome === 'object' &&
        'success' in outcome &&
        'result' in outcome
      ) {
        return (outcome as { result: Result }).result;
      }
      return outcome;
    },
    ...overrides,
  };
  return conn as unknown as FakeConnection;
};

describe('createConnectionPool', () => {
  it('does not open a fallback connection when the caller aborts before withConnection starts', async () => {
    let openedConnections = 0;
    const abortController = new AbortController();
    abortController.abort(new Error('abort fallback connection'));
    const pool = createConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      getConnection: () => {
        openedConnections++;
        return makeFakeConnection(openedConnections);
      },
    });

    await assert.rejects(
      () =>
        pool.withConnection(() => Promise.resolve(undefined), {
          abort: { signal: abortController.signal },
        }),
      /abort fallback connection/,
    );

    assert.strictEqual(openedConnections, 0);
  });

  it('passes the caller abort signal to fallback withConnection context', async () => {
    const abortController = new AbortController();
    const pool = createConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      getConnection: () => makeFakeConnection(1),
    });

    const signal = await pool.withConnection(
      (_connection, context) => Promise.resolve(context.abort.signal),
      { abort: { signal: abortController.signal } },
    );

    assert.strictEqual(signal, abortController.signal);
  });

  it('does not open a fallback transaction connection when the caller aborts before transaction starts', () => {
    let openedConnections = 0;
    const abortController = new AbortController();
    abortController.abort(new Error('abort fallback transaction'));
    const pool = createConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      getConnection: () => {
        openedConnections++;
        return makeFakeConnection(openedConnections);
      },
    });

    assert.throws(
      () => pool.transaction({ abort: { signal: abortController.signal } }),
      /abort fallback transaction/,
    );
    assert.strictEqual(openedConnections, 0);
  });
});

describe('createAmbientConnectionPool', () => {
  it('does not call the connection transaction handler when the caller aborts before withTransaction starts', async () => {
    let withTransactionCalls = 0;
    const abortController = new AbortController();
    abortController.abort(new Error('abort ambient transaction'));
    const pool = createAmbientConnectionPool({
      driverType: fakeDriverType,
      connection: makeFakeConnection(1, {
        withTransaction: <Result>() => {
          withTransactionCalls++;
          return Promise.resolve(undefined as Result);
        },
      }),
    });

    await assert.rejects(
      () =>
        pool.withTransaction(() => Promise.resolve(undefined), {
          abort: { signal: abortController.signal },
        }),
      /abort ambient transaction/,
    );
    assert.strictEqual(withTransactionCalls, 0);
  });
});

describe('createBoundedConnectionPool', () => {
  it('does not acquire a queued connection when the caller aborts while waiting', async () => {
    const created: FakeConnection[] = [];
    const pool = createBoundedConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      maxConnections: 1,
      getConnection: () => {
        const conn = makeFakeConnection(created.length + 1);
        created.push(conn);
        return conn;
      },
    });
    const activeConnection = await pool.connection();
    const abortController = new AbortController();

    const queuedConnection = pool.connection({
      abort: { signal: abortController.signal },
    });
    abortController.abort(new Error('abort queued connection'));

    await assert.rejects(queuedConnection, /abort queued connection/);

    await activeConnection.close();
    await pool.close();

    assert.strictEqual(created.length, 1);
  });

  it('closes acquired connections when the pool is closed', async () => {
    const created: FakeConnection[] = [];

    const pool = createBoundedConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      maxConnections: 2,
      getConnection: () => {
        const conn = makeFakeConnection(created.length + 1);
        created.push(conn);
        return conn;
      },
    });

    await Promise.all([
      pool.withConnection(() => Promise.resolve(1)),
      pool.withConnection(() => Promise.resolve(2)),
    ]);

    await pool.close();

    assert.strictEqual(created.length, 2);
    assert.ok(created.every((c) => c.closed));
  });

  it('waits for in-flight operations before closing', async () => {
    const created: FakeConnection[] = [];

    const pool = createBoundedConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      maxConnections: 1,
      getConnection: () => {
        const conn = makeFakeConnection(created.length + 1);
        created.push(conn);
        return conn;
      },
    });

    let callbackStarted = false;
    let callbackFinished = false;

    const inFlight = pool.withConnection(async (conn) => {
      callbackStarted = true;
      await new Promise((resolve) => setTimeout(resolve, 30));
      assert.strictEqual(conn.closed, false);
      callbackFinished = true;
    });

    await new Promise((resolve) => setImmediate(resolve));
    assert.strictEqual(callbackStarted, true);

    await pool.close();

    assert.strictEqual(callbackFinished, true);
    await inFlight;
  });

  it('force close aborts the in-flight operation context', async () => {
    const pool = createBoundedConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      maxConnections: 1,
      getConnection: () => makeFakeConnection(1),
    });

    const operationStarted = Promise.withResolvers<void>();
    const inFlight = pool.withConnection(
      async (_conn, { abort: { signal } }) => {
        operationStarted.resolve();
        await new Promise<void>((resolve) => {
          if (signal.aborted) {
            resolve();
            return;
          }
          signal.addEventListener('abort', () => resolve(), { once: true });
        });
        return signal.reason instanceof Error ? signal.reason.message : '';
      },
    );

    await operationStarted.promise;
    await pool.close({ force: true });

    assert.strictEqual(await inFlight, 'TaskProcessor has been stopped');
  });

  it('closeDeadline aborts an in-flight operation context when graceful close does not finish', async () => {
    const pool = createBoundedConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      maxConnections: 1,
      getConnection: () => makeFakeConnection(1),
    });

    const operationStarted = Promise.withResolvers<void>();
    const inFlight = pool.withConnection(
      async (_conn, { abort: { signal } }) => {
        operationStarted.resolve();
        await new Promise<void>((resolve) => {
          if (signal.aborted) {
            resolve();
            return;
          }
          signal.addEventListener('abort', () => resolve(), { once: true });
        });
        return signal.reason instanceof Error ? signal.reason.message : '';
      },
    );

    await operationStarted.promise;
    const start = Date.now();
    await pool.close({ closeDeadline: 10 });
    const elapsed = Date.now() - start;

    assert.ok(elapsed < 200);
    assert.strictEqual(await inFlight, 'TaskProcessor has been stopped');
  });

  it('force close aborts the in-flight transaction context', async () => {
    const pool = createBoundedConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      maxConnections: 1,
      getConnection: () => makeFakeConnection(1),
    });

    const operationStarted = Promise.withResolvers<void>();
    const inFlight = pool.withTransaction(
      async (_tx, { abort: { signal } }) => {
        operationStarted.resolve();
        await new Promise<void>((resolve) => {
          if (signal.aborted) {
            resolve();
            return;
          }
          signal.addEventListener('abort', () => resolve(), { once: true });
        });
        return signal.reason instanceof Error ? signal.reason.message : '';
      },
    );

    await operationStarted.promise;
    await pool.close({ force: true });

    assert.strictEqual(await inFlight, 'TaskProcessor has been stopped');
  });

  it('rejects an in-flight execute command when its signal aborts', async () => {
    const commandStarted = Promise.withResolvers<void>();
    const pool = createBoundedConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      maxConnections: 1,
      getConnection: () =>
        makeFakeConnection(1, {
          execute: {
            query: () => Promise.resolve({ rowCount: 0, rows: [] }),
            batchQuery: () => Promise.resolve([]),
            command: async () => {
              commandStarted.resolve();
              await new Promise(() => {});
              return { rowCount: 0, rows: [] };
            },
            batchCommand: () => Promise.resolve([]),
          },
        }),
    });
    const abortController = new AbortController();

    const command = pool.execute.command({} as never, {
      abort: { signal: abortController.signal },
    });
    await commandStarted.promise;
    abortController.abort(new Error('abort bounded command'));

    await assert.rejects(command, /abort bounded command/);
  });

  it('rejects new operations attempted after close', async () => {
    const pool = createBoundedConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      maxConnections: 1,
      getConnection: () => makeFakeConnection(1),
    });

    await pool.close();

    await assert.rejects(
      () => pool.withConnection(() => Promise.resolve(1)),
      /closed/i,
    );
  });

  it('respects maxConnections cap', async () => {
    const pool = createBoundedConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      maxConnections: 2,
      getConnection: () => makeFakeConnection(Math.random()),
    });

    let inFlight = 0;
    let peak = 0;

    const work = () =>
      pool.withConnection(async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 20));
        inFlight--;
      });

    await Promise.all([work(), work(), work(), work(), work()]);

    assert.strictEqual(peak, 2);
    await pool.close();
  });
});

describe('createSingletonConnectionPool', () => {
  it('drains in-flight callbacks before closing the underlying connection', async () => {
    const conn = makeFakeConnection(1);

    const pool = createSingletonConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      getConnection: () => conn,
    });

    let callbackFinished = false;
    let observedClosedDuringCall = false;

    const inFlight = pool.withConnection(async (c) => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      observedClosedDuringCall = c.closed;
      callbackFinished = true;
    });

    await new Promise((resolve) => setImmediate(resolve));

    await pool.close();

    assert.strictEqual(callbackFinished, true);
    assert.strictEqual(observedClosedDuringCall, false);
    assert.strictEqual(conn.closed, true);
    await inFlight;
  });

  it('force close does not wait for in-flight callbacks', async () => {
    const conn = makeFakeConnection(1);

    const pool = createSingletonConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      getConnection: () => conn,
    });

    const release = Promise.withResolvers<void>();
    const inFlight = pool.withConnection(() => release.promise);

    await new Promise((resolve) => setImmediate(resolve));

    const start = Date.now();
    await pool.close({ force: true });
    const elapsed = Date.now() - start;

    assert.ok(elapsed < 200);
    assert.strictEqual(conn.closed, true);

    release.resolve();
    await inFlight;
  });

  it('force close aborts the in-flight operation context', async () => {
    const conn = makeFakeConnection(1);

    const pool = createSingletonConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      getConnection: () => conn,
    });

    const operationStarted = Promise.withResolvers<void>();
    const inFlight = pool.withConnection(
      async (_conn, { abort: { signal } }) => {
        operationStarted.resolve();
        await new Promise<void>((resolve) => {
          if (signal.aborted) {
            resolve();
            return;
          }
          signal.addEventListener('abort', () => resolve(), { once: true });
        });
        return signal.reason instanceof Error ? signal.reason.message : '';
      },
    );

    await operationStarted.promise;
    await pool.close({ force: true });

    assert.strictEqual(await inFlight, 'TaskProcessor has been stopped');
  });

  it('closeDeadline aborts an in-flight operation context when graceful close does not finish', async () => {
    const conn = makeFakeConnection(1);

    const pool = createSingletonConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      getConnection: () => conn,
    });

    const operationStarted = Promise.withResolvers<void>();
    const inFlight = pool.withConnection(
      async (_conn, { abort: { signal } }) => {
        operationStarted.resolve();
        await new Promise<void>((resolve) => {
          if (signal.aborted) {
            resolve();
            return;
          }
          signal.addEventListener('abort', () => resolve(), { once: true });
        });
        return signal.reason instanceof Error ? signal.reason.message : '';
      },
    );

    await operationStarted.promise;
    const start = Date.now();
    await pool.close({ closeDeadline: 10 });
    const elapsed = Date.now() - start;

    assert.ok(elapsed < 200);
    assert.strictEqual(await inFlight, 'TaskProcessor has been stopped');
  });

  it('force close aborts the in-flight transaction context', async () => {
    const conn = makeFakeConnection(1);

    const pool = createSingletonConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      getConnection: () => conn,
    });

    const operationStarted = Promise.withResolvers<void>();
    const inFlight = pool.withTransaction(
      async (_tx, { abort: { signal } }) => {
        operationStarted.resolve();
        await new Promise<void>((resolve) => {
          if (signal.aborted) {
            resolve();
            return;
          }
          signal.addEventListener('abort', () => resolve(), { once: true });
        });
        return signal.reason instanceof Error ? signal.reason.message : '';
      },
    );

    await operationStarted.promise;
    await pool.close({ force: true });

    assert.strictEqual(await inFlight, 'TaskProcessor has been stopped');
  });

  it('rejects an in-flight execute command when its signal aborts', async () => {
    const commandStarted = Promise.withResolvers<void>();
    const conn = makeFakeConnection(1, {
      execute: {
        query: () => Promise.resolve({ rowCount: 0, rows: [] }),
        batchQuery: () => Promise.resolve([]),
        command: async () => {
          commandStarted.resolve();
          await new Promise(() => {});
          return { rowCount: 0, rows: [] };
        },
        batchCommand: () => Promise.resolve([]),
      },
    });

    const pool = createSingletonConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      getConnection: () => conn,
    });
    const abortController = new AbortController();

    const command = pool.execute.command({} as never, {
      abort: { signal: abortController.signal },
    });
    await commandStarted.promise;
    abortController.abort(new Error('abort singleton command'));

    await assert.rejects(command, /abort singleton command/);
  });

  it('rejects new operations attempted after close', async () => {
    const conn = makeFakeConnection(1);

    const pool = createSingletonConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      getConnection: () => conn,
    });

    await pool.close();

    await assert.rejects(
      () => pool.withConnection(() => Promise.resolve(1)),
      /closed/i,
    );
  });

  it('does not serialize concurrent calls', async () => {
    const conn = makeFakeConnection(1);
    const pool = createSingletonConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      getConnection: () => conn,
    });

    let inFlight = 0;
    let peak = 0;
    const work = () =>
      pool.withConnection(async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 20));
        inFlight--;
      });

    await Promise.all([work(), work(), work(), work(), work()]);

    assert.strictEqual(peak, 5);
    await pool.close();
  });
});
