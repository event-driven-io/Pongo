import type { PongoDocument } from '../typing';

export type MaybePromise<T> = T | PromiseLike<T>;

export interface PongoCacheProvider {
  get(key: string): MaybePromise<PongoDocument | null | undefined>;
  set(
    key: string,
    value: PongoDocument,
    options?: { ttl?: number },
  ): MaybePromise<void>;
  delete(key: string): MaybePromise<void>;
  getMany(
    keys: string[],
  ): MaybePromise<(PongoDocument | null | undefined)[]>;
  setMany(
    entries: { key: string; value: PongoDocument; ttl?: number }[],
  ): MaybePromise<void>;
  deleteMany(keys: string[]): MaybePromise<void>;
  clear(): MaybePromise<void>;
}

export type CacheEventHooks = {
  onHit?(key: string): void;
  onMiss?(key: string): void;
  onEvict?(key: string): void;
  onError?(error: unknown, operation: string): void;
};

export type CacheConfigObject = {
  type: string;
  max?: number;
  ttl?: number;
  [key: string]: unknown;
};

export type CacheConfig = CacheConfigObject | 'disabled';

export type CacheOptions = {
  skipCache?: boolean;
};
