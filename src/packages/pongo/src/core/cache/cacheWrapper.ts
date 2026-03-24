import type { CacheHooks, PongoCache } from './types';

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
    cacheType: provider.cacheType,
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
