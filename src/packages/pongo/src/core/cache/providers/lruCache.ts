import { LRUCache } from 'lru-cache';
import type { MaybePromise, PongoDocument } from '../../typing';
import type { PongoCache, PongoDocumentCacheKey } from '../pongoCache';

export type LRUCacheOptions = Omit<
  LRUCache.Options<string, { doc: PongoDocument | null }, unknown>,
  'max'
> & { max?: number };

const defaultLRUCacheOptions: LRUCache.Options<
  string,
  { doc: PongoDocument | null },
  unknown
> = {
  max: 1000,
};

export const lruCache = (options?: LRUCacheOptions): PongoCache => {
  const cache = new LRUCache<string, { doc: PongoDocument | null }>({
    ...defaultLRUCacheOptions,
    ...options,
  });

  return {
    cacheType: 'pongo:cache:lru',
    get: <Doc extends PongoDocument = PongoDocument>(
      key: PongoDocumentCacheKey,
    ): MaybePromise<Doc | null | undefined> => {
      const entry = cache.get(key);
      if (entry === undefined) return undefined;
      return entry.doc as Doc | null;
    },
    set: (key, value) => {
      cache.set(key, { doc: value });
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
    ): (Doc | null | undefined)[] =>
      keys.map((k) => {
        const entry = cache.get(k);
        if (entry === undefined) return undefined;
        return entry.doc as Doc | null;
      }),
    setMany: (entries) => {
      for (const { key, value } of entries) {
        cache.set(key, { doc: value });
      }
    },
    replaceMany: (entries) => {
      for (const { key, value } of entries) {
        cache.set(key, { doc: value });
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
