import { LRUCache } from 'lru-cache';
import type { PongoDocument } from '../../typing';
import type { PongoCache } from '../types';

export type LRUCacheOptions = Omit<
  LRUCache.Options<string, PongoDocument, unknown>,
  'max'
> & { max?: number };

const defaultLRUCacheOptions: LRUCache.Options<string, PongoDocument, unknown> =
  {
    max: 1000,
  };

export const lruCache = (options?: LRUCacheOptions): PongoCache => {
  const cache = new LRUCache<string, PongoDocument>({
    ...defaultLRUCacheOptions,
    ...options,
  });

  return {
    cacheType: 'pongo:cache:lru',
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
    getMany: (keys) =>
      keys.map((k) => cache.get(k)).filter((v) => v !== undefined),
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
    close: () => {
      cache.clear();
    },
  };
};
