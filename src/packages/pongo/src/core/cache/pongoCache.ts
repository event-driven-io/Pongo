import type { MaybePromise, PongoDocument, PongoUpdate } from '../typing';
import { pongoCacheWrapper } from './pongoCacheWrapper';
import type { LRUCacheOptions } from './providers';
import { identityMapCache, lruCache, noopCacheProvider } from './providers';

export type PongoDocumentCacheKey = `${string}:${string}:${string}`;

export type PongoCacheSetEntry<Doc extends PongoDocument = PongoDocument> = {
  key: PongoDocumentCacheKey;
  value: Doc;
};

export type PongoCacheType<T extends string = string> = `pongo:cache:${T}`;

export interface PongoCache<T extends string = string> {
  cacheType: PongoCacheType<T>;
  get<Doc extends PongoDocument = PongoDocument>(
    key: PongoDocumentCacheKey,
  ): MaybePromise<Doc | undefined>;
  set<Doc extends PongoDocument = PongoDocument>(
    key: PongoDocumentCacheKey,
    value: Doc,
  ): MaybePromise<void>;
  update<Doc extends PongoDocument = PongoDocument>(
    key: PongoDocumentCacheKey,
    updater: PongoUpdate<Doc>,
  ): MaybePromise<void>;
  delete(key: PongoDocumentCacheKey): MaybePromise<void>;
  getMany<Doc extends PongoDocument = PongoDocument>(
    keys: PongoDocumentCacheKey[],
  ): MaybePromise<(Doc | undefined)[]>;
  setMany(entries: PongoCacheSetEntry[]): MaybePromise<void>;
  updateMany<Doc extends PongoDocument = PongoDocument>(
    keys: PongoDocumentCacheKey[],
    updater: PongoUpdate<Doc>,
  ): MaybePromise<void>;
  deleteMany(keys: PongoDocumentCacheKey[]): MaybePromise<void>;
  clear(): MaybePromise<void>;
  close(): MaybePromise<void>;
}

export type CacheHooks = {
  onHit?(key: PongoDocumentCacheKey): void;
  onMiss?(key: PongoDocumentCacheKey): void;
  onEvict?(key: PongoDocumentCacheKey): void;
  onError?(error: unknown, operation: string): void;
};

export type CacheType = 'in-memory' | 'identity-map';

export type CacheSettings =
  | ({
      type: 'in-memory';
    } & LRUCacheOptions)
  | {
      type: 'identity-map';
    };

export type CacheConfig = CacheSettings | 'disabled';

export type CacheOptions = {
  skipCache?: boolean;
};

const DEFAULT_CONFIG: CacheSettings = { type: 'in-memory' };

export const pongoCache = (
  options?: CacheConfig | 'disabled' | PongoCache | undefined,
): PongoCache => {
  if (options === undefined || options === 'disabled') return noopCacheProvider;

  if ('cacheType' in options) return options as PongoCache;

  const config = options ?? DEFAULT_CONFIG;

  if (config.type === 'identity-map') return identityMapCache();

  const raw = lruCache(config);

  return pongoCacheWrapper({ provider: raw });
};
