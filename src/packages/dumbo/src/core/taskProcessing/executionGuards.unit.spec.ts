import assert from 'node:assert';
import { describe, it } from 'vitest';
import { Guard } from './executionGuards';

describe('Task Processing Guards', () => {
  describe('Guard.exclusiveAccess', () => {
    it('ensures operations run one at a time', async () => {
      const guard = Guard.exclusiveAccess();
      const executionOrder: number[] = [];
      let activeOperations = 0;

      const operation = async (id: number) => {
        activeOperations++;
        assert.strictEqual(
          activeOperations,
          1,
          'Only one operation should be active',
        );
        executionOrder.push(id);
        await new Promise((resolve) => setTimeout(resolve, 10));
        activeOperations--;
      };

      await Promise.all([
        guard.execute(() => operation(1)),
        guard.execute(() => operation(2)),
        guard.execute(() => operation(3)),
      ]);

      assert.strictEqual(executionOrder.length, 3);
      assert.strictEqual(activeOperations, 0);
    });

    it('propagates errors correctly', async () => {
      const guard = Guard.exclusiveAccess();

      await assert.rejects(
        () => guard.execute(() => Promise.reject(new Error('test error'))),
        /test error/,
      );
    });

    it('stops and rejects new operations after stop with force', async () => {
      const guard = Guard.exclusiveAccess();

      await guard.stop({ force: true });

      await assert.rejects(
        () => guard.execute(() => Promise.resolve(42)),
        /TaskProcessor has been stopped/,
      );
    });

    it('waits for active operations when stopping without force', async () => {
      const guard = Guard.exclusiveAccess();
      let operationCompleted = false;

      const operationPromise = guard.execute(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        operationCompleted = true;
        return 42;
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      await guard.stop();

      assert.strictEqual(
        operationCompleted,
        true,
        'Should wait for operation to complete',
      );
      const result = await operationPromise;
      assert.strictEqual(result, 42);
    });

    it('rejects queued operations on stop instead of leaving them pending', async () => {
      const guard = Guard.exclusiveAccess();

      const active = guard.execute(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return 1;
      });
      const queued = guard.execute(() => Promise.resolve(2));

      await new Promise((resolve) => setImmediate(resolve));

      await guard.stop({ force: true });

      await assert.rejects(() => queued, /TaskProcessor has been stopped/);
      await active;
    });
  });

  describe('Guard.boundedAccess', () => {
    it('limits concurrent access to resources', async () => {
      let resourceId = 0;
      const guard = Guard.boundedAccess(() => ({ id: ++resourceId }), {
        maxResources: 2,
        reuseResources: true,
      });

      let maxConcurrent = 0;
      let currentConcurrent = 0;

      const operation = async (resource: { id: number }) => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        await new Promise((resolve) => setTimeout(resolve, 10));
        currentConcurrent--;
        return resource.id;
      };

      const results = await Promise.all([
        guard.execute(operation),
        guard.execute(operation),
        guard.execute(operation),
        guard.execute(operation),
      ]);

      assert.strictEqual(maxConcurrent, 2, 'Should not exceed max resources');
      assert.strictEqual(results.length, 4);
    });

    it('reuses resources when enabled', async () => {
      const createdResources: number[] = [];
      const guard = Guard.boundedAccess(
        () => {
          const id = createdResources.length + 1;
          createdResources.push(id);
          return { id };
        },
        {
          maxResources: 2,
          reuseResources: true,
        },
      );

      await Promise.all([
        guard.execute((r) => Promise.resolve(r.id)),
        guard.execute((r) => Promise.resolve(r.id)),
        guard.execute((r) => Promise.resolve(r.id)),
        guard.execute((r) => Promise.resolve(r.id)),
      ]);

      assert.strictEqual(
        createdResources.length,
        2,
        'Should only create maxResources when reusing',
      );
    });

    it('releases resources on error', async () => {
      const guard = Guard.boundedAccess(() => ({ id: 1 }), {
        maxResources: 1,
        reuseResources: true,
      });

      await assert.rejects(
        () => guard.execute(() => Promise.reject(new Error('test error'))),
        /test error/,
      );

      const result = await guard.execute((r) => Promise.resolve(r.id));
      assert.strictEqual(
        result,
        1,
        'Should be able to use resource after error',
      );
    });

    it('stops and clears queue on stop with force', async () => {
      const guard = Guard.boundedAccess(() => ({ id: 1 }), {
        maxResources: 1,
        reuseResources: false,
      });

      await guard.stop({ force: true });

      await assert.rejects(
        () => guard.execute(() => Promise.resolve(1)),
        /TaskProcessor has been stopped/,
      );
    });

    it('waits for active operations when stopping without force', async () => {
      const guard = Guard.boundedAccess(() => ({ id: 1 }), {
        maxResources: 1,
        reuseResources: true,
      });

      let operationCompleted = false;

      const operationPromise = guard.execute(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        operationCompleted = true;
        return 1;
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      await guard.stop();

      assert.strictEqual(
        operationCompleted,
        true,
        'Should wait for operation to complete',
      );
      const result = await operationPromise;
      assert.strictEqual(result, 1);
    });

    it('rejects queued acquires on stop', async () => {
      const guard = Guard.boundedAccess(() => ({ id: 1 }), {
        maxResources: 1,
        reuseResources: false,
      });

      const acquired = await guard.acquire();
      const queuedAcquire = guard.acquire();

      await new Promise((resolve) => setImmediate(resolve));

      await guard.stop({ force: true });

      await assert.rejects(
        () => queuedAcquire,
        /TaskProcessor has been stopped/,
      );

      guard.release(acquired);
    });

    it('closes resources via closeResource on stop', async () => {
      let closed = 0;
      const guard = Guard.boundedAccess(() => ({ id: ++closed }), {
        maxResources: 2,
        reuseResources: true,
        closeResource: () => {
          // count via outer closure
        },
      });

      const closedIds: number[] = [];
      const guardWithClose = Guard.boundedAccess(
        () => {
          const id = closedIds.length;
          return { id };
        },
        {
          maxResources: 2,
          reuseResources: true,
          closeResource: (r: { id: number }) => {
            closedIds.push(r.id);
          },
        },
      );

      await Promise.all([
        guardWithClose.execute((r) => Promise.resolve(r.id)),
        guardWithClose.execute((r) => Promise.resolve(r.id)),
      ]);

      await guardWithClose.stop();

      assert.strictEqual(
        closedIds.length,
        2,
        'closeResource should be called for every resource at stop',
      );

      // Unused first guard kept just to demonstrate inert closeResource path
      void guard;
    });
  });

  describe('Guard.initializedOnce', () => {
    it('ensures initialization happens only once', async () => {
      let initCount = 0;
      const guard = Guard.initializedOnce(async () => {
        initCount++;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return `init-${initCount}`;
      });

      const results = await Promise.all([
        guard.ensureInitialized(),
        guard.ensureInitialized(),
        guard.ensureInitialized(),
      ]);

      assert.strictEqual(initCount, 1, 'Should initialize only once');
      assert.deepStrictEqual(
        results,
        ['init-1', 'init-1', 'init-1'],
        'All calls should return the same result',
      );
    });

    it('retries on failure', async () => {
      let attempts = 0;
      const guard = Guard.initializedOnce(
        () => {
          attempts++;
          if (attempts < 3) {
            throw new Error('Not ready yet');
          }
          return Promise.resolve(`success-${attempts}`);
        },
        { maxRetries: 5 },
      );

      const result = await guard.ensureInitialized();
      assert.strictEqual(attempts, 3, 'Should retry until success');
      assert.strictEqual(
        result,
        'success-3',
        'Should return result from successful attempt',
      );
    });

    it('throws after max retries exceeded', async () => {
      let attempts = 0;
      const guard = Guard.initializedOnce(
        async () => {
          attempts++;
          return Promise.reject(new Error('Always fails'));
        },
        { maxRetries: 2 },
      );

      await assert.rejects(() => guard.ensureInitialized(), /Always fails/);
      assert.strictEqual(attempts, 3, 'Should attempt maxRetries + 1 times');
    });

    it('allows reset to reinitialize', async () => {
      let initCount = 0;
      const guard = Guard.initializedOnce(() => {
        initCount++;
        return Promise.resolve(`value-${initCount}`);
      });

      const first = await guard.ensureInitialized();
      assert.strictEqual(initCount, 1);
      assert.strictEqual(first, 'value-1');

      guard.reset();
      const second = await guard.ensureInitialized();
      assert.strictEqual(initCount, 2, 'Should reinitialize after reset');
      assert.strictEqual(
        second,
        'value-2',
        'Should return new value after reset',
      );
    });

    it('stops and prevents new initialization after stop', async () => {
      const guard = Guard.initializedOnce(() => {
        return Promise.resolve('initialized');
      });

      await guard.stop({ force: true });

      await assert.rejects(
        () => guard.ensureInitialized(),
        /TaskProcessor has been stopped/,
      );
    });
  });

  describe('ctx threading via execute', () => {
    it('exclusive: operation receives ctx with a usable AbortSignal', async () => {
      const guard = Guard.exclusiveAccess();
      const seen = await guard.execute((ctx) =>
        Promise.resolve(ctx.signal instanceof AbortSignal),
      );
      assert.strictEqual(seen, true);
      await guard.stop({ force: true });
    });

    it('bounded: operation receives (resource, ctx) with a usable AbortSignal', async () => {
      const guard = Guard.boundedAccess(() => ({ id: 1 }), {
        maxResources: 1,
      });
      const seen = await guard.execute((_resource, ctx) =>
        Promise.resolve(ctx.signal instanceof AbortSignal),
      );
      assert.strictEqual(seen, true);
      await guard.stop({ force: true });
    });

    it('bounded: per-call signal fires ctx.signal without affecting the guard', async () => {
      const guard = Guard.boundedAccess(() => ({ id: 1 }), {
        maxResources: 1,
      });
      const perCall = new AbortController();
      const sawAbort = Promise.withResolvers<boolean>();

      const done = guard.execute(
        async (_resource, ctx) => {
          ctx.signal.addEventListener('abort', () => sawAbort.resolve(true));
          await new Promise<void>((resolve) => {
            if (ctx.signal.aborted) return resolve();
            ctx.signal.addEventListener('abort', () => resolve(), {
              once: true,
            });
          });
        },
        { signal: perCall.signal },
      );

      await new Promise((resolve) => setImmediate(resolve));
      perCall.abort(new Error('per-call'));

      assert.strictEqual(await sawAbort.promise, true);
      await done;
      await guard.stop({ force: true });
    });
  });

  describe('concurrency', () => {
    it('bounded guard runs up to maxResources operations concurrently', async () => {
      const guard = Guard.boundedAccess(() => ({ id: Math.random() }), {
        maxResources: 3,
      });

      let inFlight = 0;
      let peak = 0;
      const work = () =>
        guard.execute(async () => {
          inFlight++;
          peak = Math.max(peak, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 30));
          inFlight--;
        });

      await Promise.all([work(), work(), work(), work(), work()]);

      assert.strictEqual(
        peak,
        3,
        'no more than maxResources operations should be in-flight at once',
      );
      await guard.stop({ force: true });
    });

    it('bounded guard with maxResources=1 serializes all operations', async () => {
      const guard = Guard.boundedAccess(() => ({}), {
        maxResources: 1,
      });

      let inFlight = 0;
      let peak = 0;
      const work = () =>
        guard.execute(async () => {
          inFlight++;
          peak = Math.max(peak, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 10));
          inFlight--;
        });

      await Promise.all([work(), work(), work()]);

      assert.strictEqual(peak, 1);
      await guard.stop({ force: true });
    });

    it('concurrent execute calls on exclusive guard never overlap', async () => {
      const guard = Guard.exclusiveAccess();
      let inFlight = 0;
      let peak = 0;

      const work = () =>
        guard.execute(async () => {
          inFlight++;
          peak = Math.max(peak, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 5));
          inFlight--;
        });

      await Promise.all([work(), work(), work(), work()]);

      assert.strictEqual(peak, 1);
      await guard.stop({ force: true });
    });
  });
});
