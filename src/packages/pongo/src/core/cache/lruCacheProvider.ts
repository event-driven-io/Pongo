import { LRUCache } from 'lru-cache';
import type { PongoDocument } from '../typing';
import type { PongoCache } from './types';

export const lruCache = (options?: {
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
    type: 'pongo:cache:lru',
    get: (key) => cache.get(key) ?? null,
    set: (key, value, opts) => {
      cache.set(
        key,
        value,
        opts?.ttl !== undefined ? { ttl: opts.ttl } : undefined,
      );
    },
    delete: (key) => {
      cache.delete(key);
    },
    update: (key, _updater, _opts) => {
      cache.delete(key);
      // TODO: Add updater using mingo
      // const existing = cache.get(key);
      // if (existing) {
      //   const updated = updater(existing);
      //   cache.set(key, updated, opts?.ttl !== undefined ? { ttl: opts.ttl } : undefined);
      // }
    },
    getMany: (keys) => keys.map((k) => cache.get(k) ?? null),
    setMany: (entries) => {
      for (const { key, value, ttl: entryTtl } of entries) {
        cache.set(
          key,
          value,
          entryTtl !== undefined ? { ttl: entryTtl } : undefined,
        );
      }
    },
    updateMany(keys, _updater, _options) {
      for (const key of keys) {
        cache.delete(key);
        // TODO: Add updater using mingo
        // const existing = cache.get(key);
        // if (existing) {
        //   const updated = updater(existing);
        //   cache.set(key, updated, options?.ttl !== undefined ? { ttl: options.ttl } : undefined);
        // }
      }
    },
    deleteMany: (keys) => {
      for (const key of keys) cache.delete(key);
    },
    clear: () => {
      cache.clear();
    },
  };
};
