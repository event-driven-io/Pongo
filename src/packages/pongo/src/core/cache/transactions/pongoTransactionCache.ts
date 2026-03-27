import type { MaybePromise, PongoUpdate } from '../../typing';
import type { PongoDocument } from '../../typing/operations';
import type {
  PongoCache,
  PongoCacheSetEntry,
  PongoCacheType,
  PongoDocumentCacheKey,
} from '../pongoCache';
import { identityMapCache } from '../providers';

export type PongoTransactionCacheOperationOptions = {
  mainCache: PongoCache;
};

type CacheOperation =
  | {
      type: 'set';
      key: PongoDocumentCacheKey;
      value: PongoDocument | null;
      mainCache: PongoCache;
    }
  | { type: 'setMany'; entries: PongoCacheSetEntry[]; mainCache: PongoCache }
  | {
      type: 'replaceMany';
      entries: PongoCacheSetEntry[];
      mainCache: PongoCache;
    }
  | {
      type: 'update';
      key: PongoDocumentCacheKey;
      updater: PongoUpdate<PongoDocument>;
      mainCache: PongoCache;
    }
  | {
      type: 'updateMany';
      keys: PongoDocumentCacheKey[];
      updater: PongoUpdate<PongoDocument>;
      mainCache: PongoCache;
    }
  | { type: 'delete'; key: PongoDocumentCacheKey; mainCache: PongoCache }
  | {
      type: 'deleteMany';
      keys: PongoDocumentCacheKey[];
      mainCache: PongoCache;
    };

export interface PongoTransactionCache<T extends string = string> {
  type: PongoCacheType<T>;
  get<Doc extends PongoDocument = PongoDocument>(
    key: PongoDocumentCacheKey,
  ): MaybePromise<Doc | null | undefined>;
  set(
    key: PongoDocumentCacheKey,
    value: PongoDocument | null,
    options: PongoTransactionCacheOperationOptions,
  ): MaybePromise<void>;
  update<Doc extends PongoDocument = PongoDocument>(
    key: PongoDocumentCacheKey,
    updater: PongoUpdate<Doc>,
    options: PongoTransactionCacheOperationOptions,
  ): MaybePromise<void>;
  delete(
    key: PongoDocumentCacheKey,
    options: PongoTransactionCacheOperationOptions,
  ): MaybePromise<void>;
  getMany<Doc extends PongoDocument = PongoDocument>(
    keys: PongoDocumentCacheKey[],
  ): MaybePromise<(Doc | null | undefined)[]>;
  setMany(
    entries: PongoCacheSetEntry[],
    options: PongoTransactionCacheOperationOptions,
  ): MaybePromise<void>;
  replaceMany(
    entries: PongoCacheSetEntry[],
    options: PongoTransactionCacheOperationOptions,
  ): MaybePromise<void>;
  updateMany<Doc extends PongoDocument = PongoDocument>(
    keys: PongoDocumentCacheKey[],
    updater: PongoUpdate<Doc>,
    options: PongoTransactionCacheOperationOptions,
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
      options: PongoTransactionCacheOperationOptions,
    ) {
      const { mainCache } = options;
      innerCache.set(key, value);
      operations.push({
        type: 'set',
        key,
        value,
        mainCache,
      });
    },

    update<Doc extends PongoDocument = PongoDocument>(
      key: PongoDocumentCacheKey,
      updater: PongoUpdate<Doc>,
      options: PongoTransactionCacheOperationOptions,
    ) {
      const { mainCache } = options;
      innerCache.update(key, updater);
      operations.push({
        type: 'update',
        key,
        updater,
        mainCache,
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

    replaceMany(
      entries: PongoCacheSetEntry[],
      options: PongoTransactionCacheOperationOptions,
    ) {
      innerCache.replaceMany(entries);
      operations.push({
        type: 'replaceMany',
        entries,
        mainCache: options.mainCache,
      });
    },

    updateMany<Doc extends PongoDocument = PongoDocument>(
      keys: PongoDocumentCacheKey[],
      updater: PongoUpdate<Doc>,
      options: PongoTransactionCacheOperationOptions,
    ) {
      const { mainCache } = options;
      innerCache.updateMany(keys, updater);
      operations.push({
        type: 'updateMany',
        keys,
        updater,
        mainCache,
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
            await op.mainCache.set(op.key, op.value);
            break;
          case 'setMany':
            await op.mainCache.setMany(op.entries);
            break;
          case 'replaceMany':
            await op.mainCache.replaceMany(op.entries);
            break;
          case 'update':
            await op.mainCache.update(
              op.key,
              op.updater as unknown as PongoUpdate<PongoDocument>,
            );
            break;
          case 'updateMany':
            await op.mainCache.updateMany(
              op.keys,
              op.updater as unknown as PongoUpdate<PongoDocument>,
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
