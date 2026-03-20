import type { MaybePromise, PongoUpdate } from '../typing';
import type { PongoDocument } from '../typing/operations';
import { identityMapCache } from './cacheWrapper';
import type {
  PongoCache,
  PongoCacheSetEntry,
  PongoCacheSetOptions,
  PongoCacheType,
  PongoDocumentCacheKey,
} from './types';

export type PongoTransactionCacheOperationOptions = {
  mainCache: PongoCache;
};

export type PongoTransactionCacheSetOptions = PongoCacheSetOptions &
  PongoTransactionCacheOperationOptions;

type CacheOperation =
  | {
      type: 'set';
      key: PongoDocumentCacheKey;
      value: PongoDocument;
      mainCache: PongoCache;
      options?: PongoCacheSetOptions;
    }
  | { type: 'setMany'; entries: PongoCacheSetEntry[]; mainCache: PongoCache }
  | {
      type: 'update';
      key: PongoDocumentCacheKey;
      updater: PongoUpdate<PongoDocument>;
      mainCache: PongoCache;
      options?: PongoCacheSetOptions;
    }
  | {
      type: 'updateMany';
      keys: PongoDocumentCacheKey[];
      updater: PongoUpdate<PongoDocument>;
      mainCache: PongoCache;
      options?: PongoCacheSetOptions;
    }
  | { type: 'delete'; key: PongoDocumentCacheKey; mainCache: PongoCache }
  | {
      type: 'deleteMany';
      keys: PongoDocumentCacheKey[];
      mainCache: PongoCache;
    };

export interface PongoTransactionCache<T extends string = string> {
  type: PongoCacheType<T>;
  get(key: PongoDocumentCacheKey): MaybePromise<PongoDocument | null>;
  set(
    key: PongoDocumentCacheKey,
    value: PongoDocument,
    options: PongoCacheSetOptions & PongoTransactionCacheOperationOptions,
  ): MaybePromise<void>;
  update<Doc extends PongoDocument = PongoDocument>(
    key: PongoDocumentCacheKey,
    updater: PongoUpdate<Doc>,
    options: PongoCacheSetOptions & PongoTransactionCacheOperationOptions,
  ): MaybePromise<void>;
  delete(
    key: PongoDocumentCacheKey,
    options: PongoTransactionCacheOperationOptions,
  ): MaybePromise<void>;
  getMany(
    keys: PongoDocumentCacheKey[],
  ): MaybePromise<(PongoDocument | null)[]>;
  setMany(
    entries: PongoCacheSetEntry[],
    options: PongoTransactionCacheOperationOptions,
  ): MaybePromise<void>;
  updateMany<Doc extends PongoDocument = PongoDocument>(
    keys: PongoDocumentCacheKey[],
    updater: PongoUpdate<Doc>,
    options: PongoCacheSetOptions & PongoTransactionCacheOperationOptions,
  ): MaybePromise<void>;
  deleteMany(
    keys: PongoDocumentCacheKey[],
    options: PongoTransactionCacheOperationOptions,
  ): MaybePromise<void>;
  clear(): MaybePromise<void>;
  commit(): Promise<void>;
}

export const pongoTransactionCache = (options?: {
  cache?: PongoCache;
}): PongoTransactionCache => {
  const innerCache = options?.cache ?? identityMapCache();
  const operations: CacheOperation[] = [];

  const cache: PongoTransactionCache = {
    type: 'pongo:cache:transaction-buffer',

    get(key: PongoDocumentCacheKey) {
      return innerCache.get(key);
    },

    set(
      key: PongoDocumentCacheKey,
      value: PongoDocument,
      options: PongoCacheSetOptions & PongoTransactionCacheOperationOptions,
    ) {
      const { mainCache, ...cacheOptions } = options;
      innerCache.set(key, value);
      operations.push({
        type: 'set',
        key,
        value,
        mainCache,
        options: cacheOptions,
      });
    },

    update<Doc extends PongoDocument = PongoDocument>(
      key: PongoDocumentCacheKey,
      updater: PongoUpdate<Doc>,
      options: PongoCacheSetOptions & PongoTransactionCacheOperationOptions,
    ) {
      const { mainCache, ...cacheOptions } = options;
      innerCache.update(key, updater, cacheOptions);
      operations.push({
        type: 'update',
        key,
        updater,
        mainCache,
        options: cacheOptions,
      });
    },

    delete(
      key: PongoDocumentCacheKey,
      options: PongoTransactionCacheOperationOptions,
    ) {
      innerCache.delete(key);
      operations.push({ type: 'delete', key, mainCache: options.mainCache });
    },

    getMany(keys: PongoDocumentCacheKey[]) {
      return innerCache.getMany(keys);
    },

    setMany(
      entries: PongoCacheSetEntry[],
      options: PongoTransactionCacheOperationOptions,
    ) {
      innerCache.setMany(entries);
      operations.push({
        type: 'setMany',
        entries,
        mainCache: options.mainCache,
      });
    },

    updateMany<Doc extends PongoDocument = PongoDocument>(
      keys: PongoDocumentCacheKey[],
      updater: PongoUpdate<Doc>,
      options: PongoCacheSetOptions & PongoTransactionCacheOperationOptions,
    ) {
      const { mainCache, ...cacheOptions } = options;
      innerCache.updateMany(keys, updater, cacheOptions);
      operations.push({
        type: 'updateMany',
        keys,
        updater,
        mainCache,
        options: cacheOptions,
      });
    },

    deleteMany(
      keys: PongoDocumentCacheKey[],
      options: PongoTransactionCacheOperationOptions,
    ) {
      innerCache.deleteMany(keys);
      operations.push({
        type: 'deleteMany',
        keys,
        mainCache: options.mainCache,
      });
    },

    clear() {
      innerCache.clear();
      operations.length = 0;
    },

    async commit() {
      for (const op of operations) {
        switch (op.type) {
          case 'set':
            await op.mainCache.set(op.key, op.value, op.options);
            break;
          case 'setMany':
            await op.mainCache.setMany(op.entries);
            break;
          case 'update':
            await op.mainCache.update(
              op.key,
              op.updater as unknown as PongoUpdate<PongoDocument>,
              op.options,
            );
            break;
          case 'updateMany':
            await op.mainCache.updateMany(
              op.keys,
              op.updater as unknown as PongoUpdate<PongoDocument>,
              op.options,
            );
            break;
          case 'delete':
            await op.mainCache.delete(op.key);
            break;
          case 'deleteMany':
            await op.mainCache.deleteMany(op.keys);
            break;
        }
      }
      innerCache.clear();
      operations.length = 0;
    },
  };

  return cache;
};
