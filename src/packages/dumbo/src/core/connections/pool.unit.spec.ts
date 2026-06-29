import assert from 'node:assert';
import { describe, it } from 'vitest';
import type { AnyConnection } from './connection';
import {
  createBoundedConnectionPool,
  createSingletonConnectionPool,
} from './pool';

type FakeConnection = AnyConnection & { id: number; closed: boolean };

const fakeDriverType = 'fake-driver' as unknown as AnyConnection['driverType'];

const makeFakeConnection = (id: number): FakeConnection => {
  const conn = {
    id,
    closed: false,
    driverType: fakeDriverType,
    open: () => Promise.resolve(undefined),
    close: () => {
      conn.closed = true;
      return Promise.resolve();
    },
    withTransaction: async <Result>(
      handle: (
        tx: unknown,
      ) => Promise<Result | { success: boolean; result: Result }>,
    ): Promise<Result> => {
      const fakeTx = { id: `tx-${id}` };
      const outcome = await handle(fakeTx);
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
  };
  return conn as unknown as FakeConnection;
};

describe('createBoundedConnectionPool', () => {
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

    assert.strictEqual(
      created.length,
      2,
      'pool should have used 2 connections',
    );
    assert.ok(
      created.every((c) => c.closed),
      'every acquired connection should be closed after pool.close()',
    );
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

    let inFlightStillRunning = false;
    let inFlightFinished = false;

    const inFlight = pool.withConnection(async (conn) => {
      inFlightStillRunning = true;
      await new Promise((resolve) => setTimeout(resolve, 30));
      assert.strictEqual(
        conn.closed,
        false,
        'underlying connection must stay open until the in-flight op finishes',
      );
      inFlightFinished = true;
    });

    // Let the in-flight op start
    await new Promise((resolve) => setImmediate(resolve));
    assert.strictEqual(inFlightStillRunning, true);

    await pool.close();

    assert.strictEqual(
      inFlightFinished,
      true,
      'pool.close() should not resolve before the in-flight op finished',
    );
    await inFlight;
  });
});

describe('createBoundedConnectionPool', () => {
  it('falls back to force when closeDeadline elapses', async () => {
    const hangSignal = Promise.withResolvers<void>();
    const created: FakeConnection[] = [];

    const pool = createBoundedConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      maxConnections: 1,
      closeDeadline: 30,
      getConnection: () => {
        const conn = makeFakeConnection(created.length + 1);
        created.push(conn);
        return conn;
      },
    });

    const hung = pool.withConnection(() => hangSignal.promise);

    await new Promise((resolve) => setImmediate(resolve));

    const start = Date.now();
    await pool.close();
    const elapsed = Date.now() - start;

    assert.ok(
      elapsed < 200,
      `pool.close() should return within closeDeadline window, took ${elapsed}ms`,
    );

    hangSignal.resolve();
    await hung.catch(() => undefined);
  });
});

describe('createSingletonConnectionPool', () => {
  it('drains in-flight withConnection callbacks before closing the underlying connection', async () => {
    const conn = makeFakeConnection(1);

    const pool = createSingletonConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      getConnection: () => conn,
    });

    let callbackFinished = false;
    let observedClosedDuringCall = false;

    const inFlight = pool.withConnection(async (c) => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      if (c.closed) observedClosedDuringCall = true;
      callbackFinished = true;
    });

    await new Promise((resolve) => setImmediate(resolve));

    await pool.close();

    assert.strictEqual(
      callbackFinished,
      true,
      'pool.close() must wait for in-flight withConnection callback before returning',
    );
    assert.strictEqual(
      observedClosedDuringCall,
      false,
      'underlying connection must not be closed while withConnection callback is running',
    );
    assert.strictEqual(
      conn.closed,
      true,
      'underlying connection should be closed after pool.close() returns',
    );
    await inFlight;
  });

  it('falls back to force when closeDeadline elapses', async () => {
    const hangSignal = Promise.withResolvers<void>();
    const conn = makeFakeConnection(1);

    const pool = createSingletonConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      getConnection: () => conn,
      closeDeadline: 30,
    });

    const hung = pool.withConnection(() => hangSignal.promise);

    await new Promise((resolve) => setImmediate(resolve));

    const start = Date.now();
    await pool.close();
    const elapsed = Date.now() - start;

    assert.ok(
      elapsed < 200,
      `pool.close() should return within closeDeadline window, took ${elapsed}ms`,
    );
    assert.strictEqual(
      conn.closed,
      true,
      'underlying connection should be torn down after close deadline',
    );

    hangSignal.resolve();
    await hung.catch(() => undefined);
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

  it('exposes an abort signal that fires when close() is called', async () => {
    const conn = makeFakeConnection(1);

    const pool = createSingletonConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      getConnection: () => conn,
    });

    const sawAbort = Promise.withResolvers<boolean>();

    const inFlight = pool.withConnection(async (_c, { signal }) => {
      signal.addEventListener('abort', () => sawAbort.resolve(true));
      await new Promise<void>((resolve) => {
        if (signal.aborted) return resolve();
        signal.addEventListener('abort', () => resolve(), { once: true });
      });
    });

    await new Promise((resolve) => setImmediate(resolve));
    await pool.close();

    const aborted = await sawAbort.promise;
    assert.strictEqual(aborted, true);
    await inFlight;
  });
});

describe('createBoundedConnectionPool AbortSignal', () => {
  it('exposes an abort signal that fires when close() is called', async () => {
    const pool = createBoundedConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      maxConnections: 1,
      getConnection: () => makeFakeConnection(1),
    });

    const sawAbort = Promise.withResolvers<boolean>();

    const inFlight = pool.withConnection(async (_c, { signal }) => {
      signal.addEventListener('abort', () => sawAbort.resolve(true));
      await new Promise<void>((resolve) => {
        if (signal.aborted) return resolve();
        signal.addEventListener('abort', () => resolve(), { once: true });
      });
    });

    await new Promise((resolve) => setImmediate(resolve));
    await pool.close();

    const aborted = await sawAbort.promise;
    assert.strictEqual(aborted, true);
    await inFlight;
  });
});

describe('Pool per-call cancellation', () => {
  it('singleton: per-call signal aborts ctx.signal without closing the pool', async () => {
    const conn = makeFakeConnection(1);
    const pool = createSingletonConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      getConnection: () => conn,
    });

    const perCall = new AbortController();
    const sawAbort = Promise.withResolvers<boolean>();

    const inFlight = pool.withConnection(
      async (_c, { signal }) => {
        signal.addEventListener('abort', () => sawAbort.resolve(true));
        await new Promise<void>((resolve) => {
          if (signal.aborted) return resolve();
          signal.addEventListener('abort', () => resolve(), { once: true });
        });
      },
      { signal: perCall.signal },
    );

    await new Promise((resolve) => setImmediate(resolve));
    perCall.abort(new Error('user cancelled'));

    assert.strictEqual(await sawAbort.promise, true);
    await inFlight;
    assert.strictEqual(
      conn.closed,
      false,
      'pool must not close on per-call abort',
    );
    await pool.close();
  });

  it('singleton: per-call timeoutMs aborts ctx.signal even if pool stays open', async () => {
    const conn = makeFakeConnection(1);
    const pool = createSingletonConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      getConnection: () => conn,
    });

    const reason = await pool.withConnection(
      async (_c, { signal }) => {
        await new Promise<void>((resolve) => {
          if (signal.aborted) return resolve();
          signal.addEventListener('abort', () => resolve(), { once: true });
        });
        return signal.reason instanceof Error ? signal.reason.message : null;
      },
      { timeoutMs: 15 },
    );

    assert.match(String(reason), /timed out/i);
    await pool.close();
  });

  it('bounded: per-call signal aborts ctx.signal without closing the pool', async () => {
    const pool = createBoundedConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      maxConnections: 1,
      getConnection: () => makeFakeConnection(1),
    });

    const perCall = new AbortController();
    const sawAbort = Promise.withResolvers<boolean>();

    const inFlight = pool.withConnection(
      async (_c, { signal }) => {
        signal.addEventListener('abort', () => sawAbort.resolve(true));
        await new Promise<void>((resolve) => {
          if (signal.aborted) return resolve();
          signal.addEventListener('abort', () => resolve(), { once: true });
        });
      },
      { signal: perCall.signal },
    );

    await new Promise((resolve) => setImmediate(resolve));
    perCall.abort(new Error('user cancelled'));

    assert.strictEqual(await sawAbort.promise, true);
    await inFlight;
    await pool.close();
  });

  it('bounded: per-call timeoutMs aborts ctx.signal delivered to withConnection handler', async () => {
    const pool = createBoundedConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      maxConnections: 1,
      getConnection: () => makeFakeConnection(1),
    });

    const reason = await pool.withConnection(
      async (_c, { signal }) => {
        await new Promise<void>((resolve) => {
          if (signal.aborted) return resolve();
          signal.addEventListener('abort', () => resolve(), { once: true });
        });
        return signal.reason instanceof Error ? signal.reason.message : null;
      },
      { timeoutMs: 15 },
    );

    assert.match(String(reason), /timed out/i);
    await pool.close();
  });

  it('singleton: pool close still aborts ctx.signal even when a per-call signal is wired up but stays open', async () => {
    const conn = makeFakeConnection(1);
    const pool = createSingletonConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      getConnection: () => conn,
    });

    const perCall = new AbortController();
    const sawAbort = Promise.withResolvers<boolean>();

    const inFlight = pool.withConnection(
      async (_c, { signal }) => {
        signal.addEventListener('abort', () => sawAbort.resolve(true));
        await new Promise<void>((resolve) => {
          if (signal.aborted) return resolve();
          signal.addEventListener('abort', () => resolve(), { once: true });
        });
      },
      { signal: perCall.signal },
    );

    await new Promise((resolve) => setImmediate(resolve));
    await pool.close();

    assert.strictEqual(await sawAbort.promise, true);
    await inFlight;
    assert.strictEqual(perCall.signal.aborted, false);
  });
});

describe('Pool concurrency', () => {
  it('singleton: withConnection does not serialize concurrent calls — runTracked is bookkeeping, not a mutex', async () => {
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

  it('bounded: withConnection respects maxConnections cap', async () => {
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

  it('singleton: withTransaction does not serialize concurrent calls', async () => {
    const conn = makeFakeConnection(1);
    const pool = createSingletonConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      getConnection: () => conn,
    });

    let inFlight = 0;
    let peak = 0;
    const work = () =>
      pool.withTransaction(async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 20));
        inFlight--;
        return undefined;
      });

    await Promise.all([work(), work(), work(), work(), work()]);

    assert.strictEqual(peak, 5);
    await pool.close();
  });

  it('bounded: withTransaction respects maxConnections cap', async () => {
    const pool = createBoundedConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      maxConnections: 2,
      getConnection: () => makeFakeConnection(Math.random()),
    });

    let inFlight = 0;
    let peak = 0;
    const work = () =>
      pool.withTransaction(async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 20));
        inFlight--;
        return undefined;
      });

    await Promise.all([work(), work(), work(), work(), work()]);

    assert.strictEqual(peak, 2);
    await pool.close();
  });
});

describe('Pool withTransaction abort threading', () => {
  it('singleton: per-call signal aborts ctx.signal delivered to withTransaction handler', async () => {
    const conn = makeFakeConnection(1);
    const pool = createSingletonConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      getConnection: () => conn,
    });

    const perCall = new AbortController();
    const sawAbort = Promise.withResolvers<boolean>();

    const inFlight = pool.withTransaction(
      async (_tx, { signal }) => {
        signal.addEventListener('abort', () => sawAbort.resolve(true));
        await new Promise<void>((resolve) => {
          if (signal.aborted) return resolve();
          signal.addEventListener('abort', () => resolve(), { once: true });
        });
        return undefined;
      },
      { signal: perCall.signal },
    );

    await new Promise((resolve) => setImmediate(resolve));
    perCall.abort(new Error('user cancelled'));

    assert.strictEqual(await sawAbort.promise, true);
    await inFlight;
    await pool.close();
  });

  it('singleton: pool close aborts ctx.signal delivered to withTransaction handler', async () => {
    const conn = makeFakeConnection(1);
    const pool = createSingletonConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      getConnection: () => conn,
    });

    const sawAbort = Promise.withResolvers<boolean>();

    const inFlight = pool.withTransaction(async (_tx, { signal }) => {
      signal.addEventListener('abort', () => sawAbort.resolve(true));
      await new Promise<void>((resolve) => {
        if (signal.aborted) return resolve();
        signal.addEventListener('abort', () => resolve(), { once: true });
      });
      return undefined;
    });

    await new Promise((resolve) => setImmediate(resolve));
    await pool.close();

    assert.strictEqual(await sawAbort.promise, true);
    await inFlight;
  });

  it('singleton: per-call timeoutMs aborts ctx.signal delivered to withTransaction handler', async () => {
    const conn = makeFakeConnection(1);
    const pool = createSingletonConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      getConnection: () => conn,
    });

    const reason = await pool.withTransaction(
      async (_tx, { signal }) => {
        await new Promise<void>((resolve) => {
          if (signal.aborted) return resolve();
          signal.addEventListener('abort', () => resolve(), { once: true });
        });
        return signal.reason instanceof Error
          ? signal.reason.message
          : 'no-reason';
      },
      { timeoutMs: 15 },
    );

    assert.match(String(reason), /timed out/i);
    await pool.close();
  });

  it('bounded: per-call signal aborts ctx.signal delivered to withTransaction handler', async () => {
    const pool = createBoundedConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      maxConnections: 1,
      getConnection: () => makeFakeConnection(1),
    });

    const perCall = new AbortController();
    const sawAbort = Promise.withResolvers<boolean>();

    const inFlight = pool.withTransaction(
      async (_tx, { signal }) => {
        signal.addEventListener('abort', () => sawAbort.resolve(true));
        await new Promise<void>((resolve) => {
          if (signal.aborted) return resolve();
          signal.addEventListener('abort', () => resolve(), { once: true });
        });
        return undefined;
      },
      { signal: perCall.signal },
    );

    await new Promise((resolve) => setImmediate(resolve));
    perCall.abort(new Error('user cancelled'));

    assert.strictEqual(await sawAbort.promise, true);
    await inFlight;
    await pool.close();
  });

  it('bounded: pool close aborts ctx.signal delivered to withTransaction handler', async () => {
    const pool = createBoundedConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      maxConnections: 1,
      getConnection: () => makeFakeConnection(1),
    });

    const sawAbort = Promise.withResolvers<boolean>();

    const inFlight = pool.withTransaction(async (_tx, { signal }) => {
      signal.addEventListener('abort', () => sawAbort.resolve(true));
      await new Promise<void>((resolve) => {
        if (signal.aborted) return resolve();
        signal.addEventListener('abort', () => resolve(), { once: true });
      });
      return undefined;
    });

    await new Promise((resolve) => setImmediate(resolve));
    await pool.close();

    assert.strictEqual(await sawAbort.promise, true);
    await inFlight;
  });

  it('bounded: per-call timeoutMs aborts ctx.signal delivered to withTransaction handler', async () => {
    const pool = createBoundedConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      maxConnections: 1,
      getConnection: () => makeFakeConnection(1),
    });

    const reason = await pool.withTransaction(
      async (_tx, { signal }) => {
        await new Promise<void>((resolve) => {
          if (signal.aborted) return resolve();
          signal.addEventListener('abort', () => resolve(), { once: true });
        });
        return signal.reason instanceof Error
          ? signal.reason.message
          : 'no-reason';
      },
      { timeoutMs: 15 },
    );

    assert.match(String(reason), /timed out/i);
    await pool.close();
  });
});

describe('Pool lifecycle signal (outer parent)', () => {
  it('singleton: aborting the outer signal fires ctx.signal on in-flight withConnection without calling close()', async () => {
    const outer = new AbortController();
    const conn = makeFakeConnection(1);
    const pool = createSingletonConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      getConnection: () => conn,
      signal: outer.signal,
    });

    const sawAbort = Promise.withResolvers<boolean>();

    const inFlight = pool.withConnection(async (_c, { signal }) => {
      signal.addEventListener('abort', () => sawAbort.resolve(true));
      await new Promise<void>((resolve) => {
        if (signal.aborted) return resolve();
        signal.addEventListener('abort', () => resolve(), { once: true });
      });
    });

    await new Promise((resolve) => setImmediate(resolve));
    outer.abort(new Error('outer fired'));

    assert.strictEqual(await sawAbort.promise, true);
    await inFlight;
    assert.strictEqual(
      conn.closed,
      false,
      'outer abort must signal in-flight work, NOT tear the pool down',
    );
    await pool.close();
  });

  it('bounded: aborting the outer signal fires ctx.signal on in-flight withConnection', async () => {
    const outer = new AbortController();
    const pool = createBoundedConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      maxConnections: 1,
      getConnection: () => makeFakeConnection(1),
      signal: outer.signal,
    });

    const sawAbort = Promise.withResolvers<boolean>();

    const inFlight = pool.withConnection(async (_c, { signal }) => {
      signal.addEventListener('abort', () => sawAbort.resolve(true));
      await new Promise<void>((resolve) => {
        if (signal.aborted) return resolve();
        signal.addEventListener('abort', () => resolve(), { once: true });
      });
    });

    await new Promise((resolve) => setImmediate(resolve));
    outer.abort(new Error('outer fired'));

    assert.strictEqual(await sawAbort.promise, true);
    await inFlight;
    await pool.close();
  });

  it('singleton: outer signal aborting before any operation rejects subsequent enqueues fast', async () => {
    const outer = new AbortController();
    const conn = makeFakeConnection(1);
    const pool = createSingletonConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      getConnection: () => conn,
      signal: outer.signal,
    });

    outer.abort(new Error('outer fired pre-op'));

    await assert.rejects(() => pool.execute.query({} as never));
    await pool.close();
  });

  it('singleton: aborting the outer signal fires ctx.signal on in-flight withTransaction without calling close()', async () => {
    const outer = new AbortController();
    const conn = makeFakeConnection(1);
    const pool = createSingletonConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      getConnection: () => conn,
      signal: outer.signal,
    });

    const sawAbort = Promise.withResolvers<boolean>();

    const inFlight = pool.withTransaction(async (_tx, { signal }) => {
      signal.addEventListener('abort', () => sawAbort.resolve(true));
      await new Promise<void>((resolve) => {
        if (signal.aborted) return resolve();
        signal.addEventListener('abort', () => resolve(), { once: true });
      });
      return undefined;
    });

    await new Promise((resolve) => setImmediate(resolve));
    outer.abort(new Error('outer fired'));

    assert.strictEqual(await sawAbort.promise, true);
    await inFlight;
    assert.strictEqual(
      conn.closed,
      false,
      'outer abort must signal in-flight work, NOT tear the pool down',
    );
    await pool.close();
  });

  it('bounded: aborting the outer signal fires ctx.signal on in-flight withTransaction', async () => {
    const outer = new AbortController();
    const pool = createBoundedConnectionPool<FakeConnection>({
      driverType: fakeDriverType,
      maxConnections: 1,
      getConnection: () => makeFakeConnection(1),
      signal: outer.signal,
    });

    const sawAbort = Promise.withResolvers<boolean>();

    const inFlight = pool.withTransaction(async (_tx, { signal }) => {
      signal.addEventListener('abort', () => sawAbort.resolve(true));
      await new Promise<void>((resolve) => {
        if (signal.aborted) return resolve();
        signal.addEventListener('abort', () => resolve(), { once: true });
      });
      return undefined;
    });

    await new Promise((resolve) => setImmediate(resolve));
    outer.abort(new Error('outer fired'));

    assert.strictEqual(await sawAbort.promise, true);
    await inFlight;
    await pool.close();
  });
});
