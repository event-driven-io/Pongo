import type { MaybePromise, PongoDocument, PongoUpdate } from '../typing';

export type PongoDocumentCacheKey = `${string}:${string}:${string}`; 

export type PongoCacheSetOptions = { ttl?: number };

export type PongoCacheSetEntry = { key: PongoDocumentCacheKey; value: PongoDocument; } & PongoCacheSetOptions;

export type PongoCacheType<T extends string = string> = `pongo:cache:${T}`;

export interface PongoCache<T extends string = string> {
  type: PongoCacheType<T>;
  get(key: PongoDocumentCacheKey): MaybePromise<PongoDocument | null>;
  set(
    key: PongoDocumentCacheKey,
    value: PongoDocument,
    options?: PongoCacheSetOptions,
  ): MaybePromise<void>;
  update(
    key: PongoDocumentCacheKey,
    updater: PongoUpdate<T>,
    options?: PongoCacheSetOptions,
  ): MaybePromise<void>;
  delete(key: PongoDocumentCacheKey): MaybePromise<void>;
  getMany(
    keys: PongoDocumentCacheKey[],
  ): MaybePromise<(PongoDocument | null)[]>;
  setMany(
    entries: PongoCacheSetEntry[],
  ): MaybePromise<void>;
  updateMany(
    keys: PongoDocumentCacheKey [],
    updater: PongoUpdate<T>,
    options?: PongoCacheSetOptions,
  ): MaybePromise<void>;
  deleteMany(keys: PongoDocumentCacheKey[]): MaybePromise<void>;
  clear(): MaybePromise<void>;
}

export type PongoTransactionCacheOperationOptions = {
  mainCache: PongoCache;
}

export type PongoTransactionCacheSetOptions = PongoCacheSetOptions & {
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
  delete(key: PongoDocumentCacheKey, options: PongoTransactionCacheOperationOptions): MaybePromise<void>;
  getMany(
    keys: PongoDocumentCacheKey[],
  ): MaybePromise<(PongoDocument | null)[]>;
  setMany(
    entries: PongoCacheSetEntry[],
    options: PongoTransactionCacheOperationOptions,
  ): MaybePromise<void>;
  deleteMany(keys: PongoDocumentCacheKey[], options: PongoTransactionCacheOperationOptions): MaybePromise<void>;
  clear(): MaybePromise<void>;
  commit(): Promise<void>;
}

export type CacheHooks = {
  onHit?(key: PongoDocumentCacheKey): void;
  onMiss?(key: PongoDocumentCacheKey): void;
  onEvict?(key: PongoDocumentCacheKey): void;
  onError?(error: unknown, operation: string): void;
};

export type CacheSettings<T extends string = string> = {
  type: PongoCacheType<T>;
  max?: number;
  ttl?: number;
  [key: string]: unknown;
};

export type CacheConfig = CacheSettings | 'disabled';

export type CacheOptions = {
  skipCache?: boolean;
};
