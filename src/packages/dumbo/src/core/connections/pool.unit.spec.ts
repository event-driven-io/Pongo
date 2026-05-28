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
  const conn: {
    id: number;
    closed: boolean;
    driverType: AnyConnection['driverType'];
    open: () => Promise<unknown>;
    close: () => Promise<void>;
  } = {
    id,
    closed: false,
    driverType: fakeDriverType,
    open: () => Promise.resolve(undefined),
    close: () => {
      conn.closed = true;
      return Promise.resolve();
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

    let observedClosedDuringCall = false;

    const inFlight = pool.withConnection(async (c) => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      if (c.closed) observedClosedDuringCall = true;
    });

    await new Promise((resolve) => setImmediate(resolve));

    await pool.close();

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
