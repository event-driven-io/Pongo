import { DumboError } from '../errors';

const exposedGc = (): (() => void) => {
  const gc = (globalThis as { gc?: () => void }).gc;

  if (typeof gc !== 'function')
    throw new DumboError(
      'Garbage collection is not exposed. Run with --expose-gc (see vitest.config.ts).',
    );

  return gc;
};

/**
 * A WeakRef target stays alive until the current job ends, so each round
 * yields a macrotask before collecting.
 */
export const collectGarbage = async (rounds = 3): Promise<void> => {
  const gc = exposedGc();

  for (let round = 0; round < rounds; round++) {
    await new Promise((resolve) => setImmediate(resolve));
    gc();
  }
};

export const isCollected = (ref: WeakRef<object>): boolean =>
  ref.deref() === undefined;

export const retainedIndexes = (refs: WeakRef<object>[]): number[] =>
  refs.flatMap((ref, index) => (isCollected(ref) ? [] : [index]));

export const heapUsedAfterCollecting = async (): Promise<number> => {
  await collectGarbage();

  return process.memoryUsage().heapUsed;
};
