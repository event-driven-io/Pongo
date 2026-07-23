import assert from 'node:assert';
import { afterEach, describe, it } from 'vitest';
import { Clock } from './clock';

describe('Clock', () => {
  const originalTemporal = globalThis.Temporal;
  const originalPerformance = globalThis.performance;

  afterEach(() => {
    Reflect.set(globalThis, 'Temporal', originalTemporal);
    globalThis.performance = originalPerformance;
  });

  it('uses native Temporal when the runtime provides it', () => {
    let elapsedMs = 10;
    Reflect.set(globalThis, 'Temporal', {
      Now: {
        instant: () => ({ epochMilliseconds: 1_234 }),
      },
    });
    globalThis.performance = {
      ...originalPerformance,
      now: () => elapsedMs,
    };

    assert.strictEqual(Clock.now(), 1_234);

    elapsedMs = 15;
    assert.strictEqual(Clock.now(), 1_239);
  });

  it('uses monotonic performance time when Temporal is unavailable', () => {
    Reflect.set(globalThis, 'Temporal', undefined);
    globalThis.performance = {
      ...originalPerformance,
      now: () => 34,
      timeOrigin: 1_200,
    };

    assert.strictEqual(Clock.now(), 1_234);
  });
});
