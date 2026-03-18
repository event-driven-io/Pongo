import { describe, expectTypeOf, it } from 'vitest';
import type { PongoDocument } from '../typing';
import type {
    CacheConfig,
    CacheOptions,
    CacheSettings,
    MaybePromise,
    PongoCache,
} from './types';

describe('MaybePromise', () => {
  it('accepts a plain value', () => {
    expectTypeOf<string>().toMatchTypeOf<MaybePromise<string>>();
  });

  it('accepts a Promise', () => {
    expectTypeOf<Promise<string>>().toMatchTypeOf<MaybePromise<string>>();
  });
});

describe('CacheConfig', () => {
  it('accepts a CacheConfigObject', () => {
    expectTypeOf<CacheSettings>().toMatchTypeOf<CacheConfig>();
  });

  it('accepts the literal "disabled"', () => {
    expectTypeOf<'disabled'>().toMatchTypeOf<CacheConfig>();
  });

  it('does not accept arbitrary strings', () => {
    expectTypeOf<'something-else'>().not.toMatchTypeOf<CacheConfig>();
  });

  it('narrows to CacheConfigObject after excluding disabled', () => {
    type NotDisabled = Exclude<CacheConfig, 'disabled'>;
    expectTypeOf<NotDisabled>().toEqualTypeOf<CacheSettings>();
  });
});

describe('CacheOptions', () => {
  it('skipCache is boolean or undefined', () => {
    expectTypeOf<CacheOptions['skipCache']>().toEqualTypeOf<boolean | undefined>();
  });

  it('accepts empty object (all fields optional)', () => {
    expectTypeOf<{}>().toMatchTypeOf<CacheOptions>();
  });
});

describe('PongoCacheProvider', () => {
  it('get signature', () => {
    expectTypeOf<PongoCache['get']>().toEqualTypeOf<
      (key: string) => MaybePromise<PongoDocument | null | undefined>
    >();
  });

  it('set signature', () => {
    expectTypeOf<PongoCache['set']>().toEqualTypeOf<
      (key: string, value: PongoDocument, options?: { ttl?: number }) => MaybePromise<void>
    >();
  });

  it('delete signature', () => {
    expectTypeOf<PongoCache['delete']>().toEqualTypeOf<
      (key: string) => MaybePromise<void>
    >();
  });

  it('getMany signature', () => {
    expectTypeOf<PongoCache['getMany']>().toEqualTypeOf<
      (keys: string[]) => MaybePromise<(PongoDocument | null | undefined)[]>
    >();
  });

  it('setMany signature', () => {
    expectTypeOf<PongoCache['setMany']>().toEqualTypeOf<
      (entries: { key: string; value: PongoDocument; ttl?: number }[]) => MaybePromise<void>
    >();
  });

  it('deleteMany signature', () => {
    expectTypeOf<PongoCache['deleteMany']>().toEqualTypeOf<
      (keys: string[]) => MaybePromise<void>
    >();
  });

  it('clear signature', () => {
    expectTypeOf<PongoCache['clear']>().toEqualTypeOf<
      () => MaybePromise<void>
    >();
  });

  it('sync map-backed object satisfies interface', () => {
    const store = new Map<string, PongoDocument>();
    const provider = {
      get: (key: string) => store.get(key) ?? null,
      set: (key: string, value: PongoDocument) => { store.set(key, value); },
      delete: (key: string) => { store.delete(key); },
      getMany: (keys: string[]) => keys.map((k) => store.get(k) ?? null),
      setMany: (entries: { key: string; value: PongoDocument }[]) => {
        for (const { key, value } of entries) store.set(key, value);
      },
      deleteMany: (keys: string[]) => { for (const key of keys) store.delete(key); },
      clear: () => { store.clear(); },
    } satisfies PongoCache;
    expectTypeOf(provider).toMatchTypeOf<PongoCache>();
  });

  it('async provider satisfies interface', () => {
    const store = new Map<string, PongoDocument>();
    const provider = {
      get: async (key: string) => store.get(key) ?? null,
      set: async (key: string, value: PongoDocument) => { store.set(key, value); },
      delete: async (key: string) => { store.delete(key); },
      getMany: async (keys: string[]) => keys.map((k) => store.get(k) ?? null),
      setMany: async (entries: { key: string; value: PongoDocument }[]) => {
        for (const { key, value } of entries) store.set(key, value);
      },
      deleteMany: async (keys: string[]) => { for (const key of keys) store.delete(key); },
      clear: async () => store.clear(),
    } satisfies PongoCache;
    expectTypeOf(provider).toMatchTypeOf<PongoCache>();
  });
});
