import assert from 'node:assert';
import { describe, it } from 'vitest';
import { ResourcePool } from './resourcePool';

describe('ResourcePool.create', () => {
  it('produces a new resource each acquire when reuse is disabled', async () => {
    let counter = 0;
    const pool = ResourcePool.create<{ id: number }>(() => ({ id: ++counter }));

    const a = await pool.acquire();
    pool.release(a);
    const b = await pool.acquire();

    assert.notStrictEqual(a, b);
    assert.strictEqual(a.id, 1);
    assert.strictEqual(b.id, 2);
  });

  it('reuses released resources when reuseResources is true', async () => {
    let counter = 0;
    const pool = ResourcePool.create<{ id: number }>(
      () => ({ id: ++counter }),
      { reuseResources: true },
    );

    const a = await pool.acquire();
    pool.release(a);
    const b = await pool.acquire();

    assert.strictEqual(a, b);
    assert.strictEqual(counter, 1);
  });

  it('creates new resources when the cache is empty even with reuse enabled', async () => {
    let counter = 0;
    const pool = ResourcePool.create<{ id: number }>(
      () => ({ id: ++counter }),
      { reuseResources: true },
    );

    const a = await pool.acquire();
    const b = await pool.acquire();

    assert.notStrictEqual(a, b);
    assert.strictEqual(counter, 2);
  });

  it('release without reuse drops the resource (no caching)', async () => {
    let counter = 0;
    const pool = ResourcePool.create<{ id: number }>(() => ({ id: ++counter }));

    const a = await pool.acquire();
    pool.release(a);
    const b = await pool.acquire();
    const c = await pool.acquire();

    assert.strictEqual(counter, 3);
    assert.notStrictEqual(a, b);
    assert.notStrictEqual(b, c);
  });

  it('closeAll invokes closeResource for every acquired resource', async () => {
    const closed: number[] = [];
    let counter = 0;
    const pool = ResourcePool.create<{ id: number }>(
      () => ({ id: ++counter }),
      {
        reuseResources: true,
        closeResource: (r) => {
          closed.push(r.id);
        },
      },
    );

    const a = await pool.acquire();
    const b = await pool.acquire();
    pool.release(a);

    await pool.close();

    assert.deepStrictEqual(closed.sort(), [a.id, b.id].sort());
  });

  it('closeAll is a no-op when no resources have been acquired', async () => {
    const closed: number[] = [];
    const pool = ResourcePool.create<{ id: number }>(() => ({ id: 1 }), {
      closeResource: (r) => {
        closed.push(r.id);
      },
    });

    await pool.close();
    assert.deepStrictEqual(closed, []);
  });

  it('closeAll clears the cache so subsequent acquire creates fresh resources', async () => {
    let counter = 0;
    const pool = ResourcePool.create<{ id: number }>(
      () => ({ id: ++counter }),
      { reuseResources: true },
    );

    const a = await pool.acquire();
    pool.release(a);

    await pool.close();

    const b = await pool.acquire();
    assert.notStrictEqual(a, b);
    assert.strictEqual(b.id, 2);
  });

  it('awaits async getResource calls', async () => {
    let counter = 0;
    const pool = ResourcePool.create<{ id: number }>(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return { id: ++counter };
    });

    const a = await pool.acquire();
    assert.strictEqual(a.id, 1);
  });
});
