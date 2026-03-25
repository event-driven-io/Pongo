import { LRUCache } from 'lru-cache';
import type { MaybePromise, PongoDocument } from '../../typing';
import type { PongoCache, PongoDocumentCacheKey } from '../pongoCache';

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
    get: <Doc extends PongoDocument = PongoDocument>(
      key: PongoDocumentCacheKey,
    ): MaybePromise<Doc | undefined> =>
      cache.get(key) as MaybePromise<Doc | undefined>,
    set: (key, value) => {
      cache.set(key, value);
    },
    delete: (key) => {
      cache.delete(key);
    },
    update: (key, _updater) => {
      cache.delete(key);
      // TODO: Add updater using mingo
      // const existing = cache.get(key);
      // if (existing) {
      //   const updated = updater(existing);
      //   cache.set(key, updated, opts?.ttl !== undefined ? { ttl: opts.ttl } : undefined);
      // }
    },
    getMany: <Doc extends PongoDocument = PongoDocument>(
      keys: PongoDocumentCacheKey[],
    ): (Doc | undefined)[] => keys.map((k) => cache.get(k) as Doc | undefined),
    setMany: (entries) => {
      for (const { key, value } of entries) {
        cache.set(key, value);
      }
    },
    updateMany(keys, _updater) {
      for (const key of keys) {
        cache.delete(key);
        // TODO: Add updater using mingo
        // const existing = cache.get(key);
        // if (existing) {
        //   const updated = updater(existing);
        //   cache.set(key, updated);
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
