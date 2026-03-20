import type { PongoDocument } from '../typing';
import { resolveCacheConfig } from './configResolution';
import { lruCache } from './lruCacheProvider';
import type { CacheConfig, CacheHooks, PongoCache } from './types';

export const pongoCacheWrapper = (options: {
  provider: PongoCache;
  hooks?: CacheHooks;
  defaultTtl?: number;
}): PongoCache => {
  const { provider, hooks, defaultTtl } = options;

  const onError = (error: unknown, operation: string) => {
    hooks?.onError?.(error, operation);
  };

  return {
    type: provider.type,
    async get(key) {
      try {
        const result = await provider.get(key);
        if (result != null) {
          hooks?.onHit?.(key);
        } else {
          hooks?.onMiss?.(key);
        }
        return result;
      } catch (error) {
        onError(error, 'get');
        hooks?.onMiss?.(key);
        return null;
      }
    },

    async set(key, value, opts) {
      try {
        await provider.set(
          key,
          value,
          opts ?? (defaultTtl !== undefined ? { ttl: defaultTtl } : undefined),
        );
      } catch (error) {
        onError(error, 'set');
      }
    },

    async update(key, updater, opts) {
      try {
        await provider.set(
          key,
          updater,
          opts ?? (defaultTtl !== undefined ? { ttl: defaultTtl } : undefined),
        );
      } catch (error) {
        onError(error, 'update');
      }
    },

    async delete(key) {
      try {
        await provider.delete(key);
        hooks?.onEvict?.(key);
      } catch (error) {
        onError(error, 'delete');
      }
    },

    async getMany(keys) {
      try {
        return await provider.getMany(keys);
      } catch (error) {
        onError(error, 'getMany');
        return [];
      }
    },

    async setMany(entries) {
      try {
        const resolved = defaultTtl;
        await provider.setMany(
          entries.map((e) => {
            const ttl = e.ttl ?? resolved;
            return ttl !== undefined
              ? { key: e.key, value: e.value, ttl }
              : { key: e.key, value: e.value };
          }),
        );
      } catch (error) {
        onError(error, 'setMany');
      }
    },

    async updateMany(keys, updater, opts) {
      try {
        await provider.setMany(
          keys.map((key) => ({
            key,
            value: updater,
            ...(opts ?? (defaultTtl !== undefined ? { ttl: defaultTtl } : {})),
          })),
        );
      } catch (error) {
        onError(error, 'updateMany');
      }
    },

    async deleteMany(keys) {
      try {
        await provider.deleteMany(keys);
        for (const key of keys) hooks?.onEvict?.(key);
      } catch (error) {
        onError(error, 'deleteMany');
      }
    },

    async clear() {
      await provider.clear();
    },
  };
};

export const noopCacheProvider: PongoCache = {
  type: 'pongo:cache:no-op',
  get: async () => await Promise.resolve(null),
  set: () => {},
  update: () => {},
  delete: () => {},
  getMany: () => [],
  setMany: () => {},
  updateMany: () => {},
  deleteMany: () => {},
  clear: () => {},
};

export const identityMapCache = (): PongoCache => {
  const store = new Map<string, PongoDocument>();

  return {
    type: 'pongo:cache:identity-map',
    get: (key) => Promise.resolve(store.get(key) ?? null),
    set: (key, value) => {
      store.set(key, value);
    },
    update: (key, _updater) => {
      // TODO: Implement proper update logic instead of just setting the updater as value
      store.delete(key);
      // const existing = store.get(key);
      // if (!existing) return;
      // const updated = typeof updater === 'function' ? updater(existing) : updater;
      // store.set(key, updated);
    },
    delete: (key) => {
      store.delete(key);
    },
    getMany: (keys) => Promise.resolve(keys.map((k) => store.get(k) ?? null)),
    setMany: (entries) => {
      for (const { key, value } of entries) store.set(key, value);
    },
    updateMany: (keys, _updater) => {
      // TODO: Implement proper update logic instead of just setting the updater as value
      for (const key of keys) store.delete(key);
      // for (const key of keys) {
      //   const existing = store.get(key);
      //   if (!existing) continue;
      //   const updated = typeof updater === 'function' ? updater(existing) : updater;
      //   store.set(key, updated);
      // }
    },
    deleteMany: (keys) => {
      for (const key of keys) store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
};

export const resolveCollectionCacheProvider = (
  cacheOption: CacheConfig | 'disabled' | PongoCache | undefined,
): PongoCache => {
  if (cacheOption === 'disabled') return noopCacheProvider;

  if (
    cacheOption !== undefined &&
    typeof (cacheOption as PongoCache).get === 'function'
  )
    return cacheOption as PongoCache;

  const config = resolveCacheConfig(
    cacheOption === undefined ? undefined : (cacheOption as CacheConfig),
  );
  if (config === 'disabled') return noopCacheProvider;

  const raw = lruCache({
    ...(config.max !== undefined ? { max: config.max } : {}),
    ...(config.ttl !== undefined ? { ttl: config.ttl } : {}),
  });
  return pongoCacheWrapper({ provider: raw });
};
