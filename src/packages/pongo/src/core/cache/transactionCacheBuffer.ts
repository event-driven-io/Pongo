import type { PongoDocument } from '../typing/operations';
import type { PongoCache, TransactionCacheBuffer } from './types';

/**
 * Factory for a transaction-aware cache buffer (module pattern, not a class).
 */
export function createTransactionCacheBuffer(underlying: PongoCache): TransactionCacheBuffer {
  const sets = new Map<string, PongoDocument>();
  const deletes = new Set<string>();

  return {
    async get(key: string) {
      if (deletes.has(key)) return undefined;
      if (sets.has(key)) return sets.get(key);
      return underlying.get(key);
    },
    async set(key: string, value: PongoDocument) {
      sets.set(key, value);
      deletes.delete(key);
    },
    async delete(key: string) {
      sets.delete(key);
      deletes.add(key);
    },
    async getMany(keys: string[]) {
      return Promise.all(keys.map((k) => this.get(k)));
    },
    async setMany(entries: { key: string; value: PongoDocument }[]) {
      for (const { key, value } of entries) {
        await this.set(key, value);
      }
    },
    async deleteMany(keys: string[]) {
      for (const key of keys) {
        await this.delete(key);
      }
    },
    async clear() {
      sets.clear();
      deletes.clear();
      await underlying.clear();
    },
    async flush() {
      if (sets.size > 0) {
        await underlying.setMany(
          Array.from(sets.entries()).map(([key, value]) => ({ key, value }))
        );
      }
      if (deletes.size > 0) {
        await underlying.deleteMany(Array.from(deletes));
      }
      sets.clear();
      deletes.clear();
    },
    discard() {
      sets.clear();
      deletes.clear();
    },
  } satisfies PongoCache & { flush(): Promise<void>; discard(): void };
}
