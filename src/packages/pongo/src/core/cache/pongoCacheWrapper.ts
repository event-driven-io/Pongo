import type { PongoDocument } from '../typing';
import type {
  CacheHooks,
  PongoCache,
  PongoDocumentCacheKey,
} from './pongoCache';

export const pongoCacheWrapper = (options: {
  provider: PongoCache;
  hooks?: CacheHooks;
}): PongoCache => {
  const { provider, hooks } = options;

  const onError = (error: unknown, operation: string) => {
    hooks?.onError?.(error, operation);
  };
  let isClosed = false;

  return {
    cacheType: provider.cacheType,
    async get<Doc extends PongoDocument = PongoDocument>(
      key: PongoDocumentCacheKey,
    ): Promise<Doc | null | undefined> {
      try {
        const result = await provider.get<Doc>(key);
        if (result !== undefined) {
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

    async getMany(keys) {
      try {
        return await provider.getMany(keys);
      } catch (error) {
        onError(error, 'getMany');
        return [];
      }
    },

    async set(key, value) {
      try {
        await provider.set(key, value);
      } catch (error) {
        onError(error, 'set');
      }
    },

    async setMany(entries) {
      try {
        await provider.setMany(entries);
      } catch (error) {
        onError(error, 'setMany');
      }
    },

    async update(key, updater) {
      try {
        await provider.update(key, updater);
      } catch (error) {
        onError(error, 'update');
      }
    },

    async updateMany(keys, updater) {
      try {
        await provider.updateMany(keys, updater);
      } catch (error) {
        onError(error, 'updateMany');
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

    async deleteMany(keys) {
      try {
        await provider.deleteMany(keys);
        for (const key of keys) hooks?.onEvict?.(key);
      } catch (error) {
        onError(error, 'deleteMany');
      }
    },

    clear() {
      return provider.clear();
    },

    close() {
      if (isClosed) return;

      isClosed = true;
      return provider.close();
    },
  };
};
