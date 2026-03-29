import { describe, expect, it } from 'vitest';
import { identityMapCache } from './identityMapCache';

describe('identityMapCache', () => {
  it('returns undefined for missing keys', async () => {
    const cache = identityMapCache();
    expect(await cache.get('db:collection:missing')).toBeUndefined();
  });

  it('set then get returns the stored document', async () => {
    const cache = identityMapCache();
    const doc = { _id: 'a', name: 'Alice' };
    cache.set('db:collection:a', doc);
    expect(await cache.get('db:collection:a')).toEqual(doc);
  });

  it('delete removes a cached entry', async () => {
    const cache = identityMapCache();
    cache.set('db:collection:a', { _id: 'a' });
    cache.delete('db:collection:a');
    expect(await cache.get('db:collection:a')).toBeUndefined();
  });

  it('getMany returns documents for found keys and undefined for missing', () => {
    const cache = identityMapCache();
    cache.set('db:collection:k1', { _id: 'k1' });
    cache.set('db:collection:k2', { _id: 'k2' });
    const results = cache.getMany([
      'db:collection:k1',
      'db:collection:missing',
      'db:collection:k2',
    ]) as (Record<string, unknown> | undefined)[];
    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({ _id: 'k1' });
    expect(results[1]).toBeUndefined();
    expect(results[2]).toEqual({ _id: 'k2' });
  });

  it('setMany stores multiple documents retrievable via get', async () => {
    const cache = identityMapCache();
    cache.setMany([
      { key: 'db:collection:a', value: { _id: 'a' } },
      { key: 'db:collection:b', value: { _id: 'b' } },
    ]);
    expect(await cache.get('db:collection:a')).toEqual({ _id: 'a' });
    expect(await cache.get('db:collection:b')).toEqual({ _id: 'b' });
  });

  it('deleteMany removes multiple entries', async () => {
    const cache = identityMapCache();
    cache.setMany([
      { key: 'db:collection:a', value: { _id: 'a' } },
      { key: 'db:collection:b', value: { _id: 'b' } },
      { key: 'db:collection:c', value: { _id: 'c' } },
    ]);
    cache.deleteMany(['db:collection:a', 'db:collection:b']);
    expect(await cache.get('db:collection:a')).toBeUndefined();
    expect(await cache.get('db:collection:b')).toBeUndefined();
    expect(await cache.get('db:collection:c')).toEqual({ _id: 'c' });
  });

  it('clear removes all entries', async () => {
    const cache = identityMapCache();
    cache.setMany([
      { key: 'db:collection:a', value: { _id: 'a' } },
      { key: 'db:collection:b', value: { _id: 'b' } },
    ]);
    cache.clear();
    expect(await cache.get('db:collection:a')).toBeUndefined();
    expect(await cache.get('db:collection:b')).toBeUndefined();
  });

  it('close clears all entries', async () => {
    const cache = identityMapCache();
    cache.setMany([
      { key: 'db:collection:a', value: { _id: 'a' } },
      { key: 'db:collection:b', value: { _id: 'b' } },
    ]);
    cache.close();
    expect(await cache.get('db:collection:a')).toBeUndefined();
    expect(await cache.get('db:collection:b')).toBeUndefined();
  });

  it('set null then get returns null', async () => {
    const cache = identityMapCache();
    cache.set('db:collection:a', null);
    expect(await cache.get('db:collection:a')).toBeNull();
  });

  it('set null is distinguishable from missing key', async () => {
    const cache = identityMapCache();
    cache.set('db:collection:a', null);
    expect(await cache.get('db:collection:a')).toBeNull();
    expect(await cache.get('db:collection:missing')).toBeUndefined();
  });

  it('getMany returns null for null-cached keys and undefined for missing', () => {
    const cache = identityMapCache();
    cache.set('db:collection:a', null);
    const results = cache.getMany([
      'db:collection:a',
      'db:collection:missing',
    ]) as (Record<string, unknown> | null | undefined)[];
    expect(results[0]).toBeNull();
    expect(results[1]).toBeUndefined();
  });

  it('setMany with null values — get returns null', async () => {
    const cache = identityMapCache();
    cache.setMany([
      { key: 'db:collection:a', value: null },
      { key: 'db:collection:b', value: { _id: 'b' } },
    ]);
    expect(await cache.get('db:collection:a')).toBeNull();
    expect(await cache.get('db:collection:b')).toEqual({ _id: 'b' });
  });

  it('delete removes a null-cached entry', async () => {
    const cache = identityMapCache();
    cache.set('db:collection:a', null);
    cache.delete('db:collection:a');
    expect(await cache.get('db:collection:a')).toBeUndefined();
  });

  it('has no max size — stores unlimited entries', async () => {
    const cache = identityMapCache();
    const count = 2000;
    for (let i = 0; i < count; i++) {
      cache.set(`db:collection:${i}`, { _id: String(i) });
    }
    for (let i = 0; i < count; i++) {
      expect(await cache.get(`db:collection:${i}`)).toBeDefined();
    }
  });
});
