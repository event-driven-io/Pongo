import type { CacheEventHooks, PongoCacheProvider } from './types';

export const pongoCacheWrapper = (options: {
  provider: PongoCacheProvider;
  dbName: string;
  collectionName: string;
  hooks?: CacheEventHooks;
  defaultTtl?: number;
}): PongoCacheProvider => {
  const { provider, dbName, collectionName, hooks, defaultTtl } = options;
  const prefix = `${dbName}:${collectionName}:`;
  const k = (key: string) => `${prefix}${key}`;

  const onError = (error: unknown, operation: string) => {
    hooks?.onError?.(error, operation);
  };

  return {
    async get(key) {
      try {
        const result = await provider.get(k(key));
        if (result != null) {
          hooks?.onHit?.(key);
        } else {
          hooks?.onMiss?.(key);
        }
        return result;
      } catch (error) {
        onError(error, 'get');
        hooks?.onMiss?.(key);
        return undefined;
      }
    },

    async set(key, value, opts) {
      try {
        await provider.set(k(key), value, opts ?? (defaultTtl !== undefined ? { ttl: defaultTtl } : undefined));
      } catch (error) {
        onError(error, 'set');
      }
    },

    async delete(key) {
      try {
        await provider.delete(k(key));
        hooks?.onEvict?.(key);
      } catch (error) {
        onError(error, 'delete');
      }
    },

    async getMany(keys) {
      try {
        return await provider.getMany(keys.map(k));
      } catch (error) {
        onError(error, 'getMany');
        return keys.map(() => undefined);
      }
    },

    async setMany(entries) {
      try {
        const resolved = defaultTtl;
        await provider.setMany(
          entries.map((e) => {
            const ttl = e.ttl ?? resolved;
            return ttl !== undefined
              ? { key: k(e.key), value: e.value, ttl }
              : { key: k(e.key), value: e.value };
          }),
        );
      } catch (error) {
        onError(error, 'setMany');
      }
    },

    async deleteMany(keys) {
      try {
        await provider.deleteMany(keys.map(k));
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
