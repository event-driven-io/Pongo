import { LRUCache } from 'lru-cache';
import type { PongoDocument } from '../typing';
import type { PongoCache } from './types';

export const inMemoryCacheProvider = (options?: {
  max?: number;
  ttl?: number;
}): PongoCache => {
  const max = options?.max ?? 1000;
  const ttl = options?.ttl;

  const cache = new LRUCache<string, PongoDocument>({
    max,
    ...(ttl !== undefined ? { ttl } : {}),
  });

  return {
    get: (key) => cache.get(key),
    set: (key, value, opts) => {
      cache.set(key, value, opts?.ttl !== undefined ? { ttl: opts.ttl } : undefined);
    },
    delete: (key) => { cache.delete(key); },
    getMany: (keys) => keys.map((k) => cache.get(k)),
    setMany: (entries) => {
      for (const { key, value, ttl: entryTtl } of entries) {
        cache.set(key, value, entryTtl !== undefined ? { ttl: entryTtl } : undefined);
      }
    },
    deleteMany: (keys) => { for (const key of keys) cache.delete(key); },
    clear: () => { cache.clear(); },
  };
};
