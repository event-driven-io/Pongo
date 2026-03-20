import type { MaybePromise, PongoDocument, PongoUpdate } from '../typing';

export type PongoDocumentCacheKey = `${string}:${string}:${string}`;

export type PongoCacheSetOptions = { ttl?: number };

export type PongoCacheSetEntry<Doc extends PongoDocument = PongoDocument> = {
  key: PongoDocumentCacheKey;
  value: Doc;
} & PongoCacheSetOptions;

export type PongoCacheType<T extends string = string> = `pongo:cache:${T}`;

export interface PongoCache<T extends string = string> {
  type: PongoCacheType<T>;
  get(key: PongoDocumentCacheKey): MaybePromise<PongoDocument | null>;
  set<Doc extends PongoDocument = PongoDocument>(
    key: PongoDocumentCacheKey,
    value: Doc,
    options?: PongoCacheSetOptions,
  ): MaybePromise<void>;
  update<Doc extends PongoDocument = PongoDocument>(
    key: PongoDocumentCacheKey,
    updater: PongoUpdate<Doc>,
    options?: PongoCacheSetOptions,
  ): MaybePromise<void>;
  delete(key: PongoDocumentCacheKey): MaybePromise<void>;
  getMany(
    keys: PongoDocumentCacheKey[],
  ): MaybePromise<(PongoDocument | null)[]>;
  setMany(entries: PongoCacheSetEntry[]): MaybePromise<void>;
  updateMany<Doc extends PongoDocument = PongoDocument>(
    keys: PongoDocumentCacheKey[],
    updater: PongoUpdate<Doc>,
    options?: PongoCacheSetOptions,
  ): MaybePromise<void>;
  deleteMany(keys: PongoDocumentCacheKey[]): MaybePromise<void>;
  clear(): MaybePromise<void>;
}

export type CacheHooks = {
  onHit?(key: PongoDocumentCacheKey): void;
  onMiss?(key: PongoDocumentCacheKey): void;
  onEvict?(key: PongoDocumentCacheKey): void;
  onError?(error: unknown, operation: string): void;
};

export type CacheType = 'in-memory';

export type CacheSettings = {
  type: CacheType;
  max?: number;
  ttl?: number;
  [key: string]: unknown;
};

export type CacheConfig = CacheSettings | 'disabled';

export type CacheOptions = {
  skipCache?: boolean;
};
