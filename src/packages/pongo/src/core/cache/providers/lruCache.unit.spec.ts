import { describe, expect, it } from 'vitest';
import { lruCache } from './lruCache';

describe('inMemoryCacheProvider', () => {
  it('returns null for missing keys', () => {
    const cache = lruCache();
    expect(cache.get('db:collection:missing')).toBeNull();
  });

  it('set then get returns the stored document', () => {
    const cache = lruCache();
    const doc = { _id: 'a', name: 'Alice' };
    cache.set('db:collection:a', doc);
    expect(cache.get('db:collection:a')).toEqual(doc);
  });

  it('set with TTL — document expires after TTL', async () => {
    const cache = lruCache({ ttl: 50 });
    cache.set('db:collection:x', { _id: 'x' });
    expect(cache.get('db:collection:x')).toBeDefined();
    await new Promise((r) => setTimeout(r, 100));
    expect(cache.get('db:collection:x')).toBeNull();
  });

  it('delete removes a cached entry', () => {
    const cache = lruCache();
    cache.set('db:collection:a', { _id: 'a' });
    cache.delete('db:collection:a');
    expect(cache.get('db:collection:a')).toBeNull();
  });

  it('getMany returns documents for found keys and undefined for missing', () => {
    const cache = lruCache();
    cache.set('db:collection:k1', { _id: 'k1' });
    cache.set('db:collection:k2', { _id: 'k2' });
    const results = cache.getMany([
      'db:collection:k1',
      'db:collection:missing',
      'db:collection:k2',
    ]) as (Record<string, unknown> | null | undefined)[];
    expect(results[0]).toEqual({ _id: 'k1' });
    expect(results[1]).toBeNull();
    expect(results[2]).toEqual({ _id: 'k2' });
  });

  it('setMany stores multiple documents retrievable via get', () => {
    const cache = lruCache();
    cache.setMany([
      { key: 'db:collection:a', value: { _id: 'a' } },
      { key: 'db:collection:b', value: { _id: 'b' } },
    ]);
    expect(cache.get('db:collection:a')).toEqual({ _id: 'a' });
    expect(cache.get('db:collection:b')).toEqual({ _id: 'b' });
  });

  it('deleteMany removes multiple entries', () => {
    const cache = lruCache();
    cache.setMany([
      { key: 'db:collection:a', value: { _id: 'a' } },
      { key: 'db:collection:b', value: { _id: 'b' } },
      { key: 'db:collection:c', value: { _id: 'c' } },
    ]);
    cache.deleteMany(['db:collection:a', 'db:collection:b']);
    expect(cache.get('db:collection:a')).toBeNull();
    expect(cache.get('db:collection:b')).toBeNull();
    expect(cache.get('db:collection:c')).toEqual({ _id: 'c' });
  });

  it('clear removes all entries', () => {
    const cache = lruCache();
    cache.setMany([
      { key: 'db:collection:a', value: { _id: 'a' } },
      { key: 'db:collection:b', value: { _id: 'b' } },
    ]);
    cache.clear();
    expect(cache.get('db:collection:a')).toBeNull();
    expect(cache.get('db:collection:b')).toBeNull();
  });

  it('respects max — LRU entry is evicted when full', () => {
    const cache = lruCache({ max: 2 });
    cache.set('db:collection:a', { _id: 'a' });
    cache.set('db:collection:b', { _id: 'b' });
    cache.get('db:collection:a');
    cache.set('db:collection:c', { _id: 'c' });
    expect(cache.get('db:collection:a')).toBeDefined();
    expect(cache.get('db:collection:c')).toBeDefined();
    expect(cache.get('db:collection:b')).toBeNull();
  });

  it('returns values synchronously (not wrapped in Promises)', () => {
    const cache = lruCache();
    cache.set('db:collection:a', { _id: 'a' });
    const result = cache.get('db:collection:a');
    expect(result).not.toBeInstanceOf(Promise);
    expect(result).toEqual({ _id: 'a' });
  });
});
