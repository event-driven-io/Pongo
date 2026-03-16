import { describe, expect, it } from 'vitest';
import { inMemoryCacheProvider } from './inMemoryProvider';

describe('inMemoryCacheProvider', () => {
  it('returns undefined for missing keys', () => {
    const cache = inMemoryCacheProvider();
    expect(cache.get('missing')).toBeUndefined();
  });

  it('set then get returns the stored document', () => {
    const cache = inMemoryCacheProvider();
    const doc = { _id: 'a', name: 'Alice' };
    cache.set('a', doc);
    expect(cache.get('a')).toEqual(doc);
  });

  it('set with TTL — document expires after TTL', async () => {
    const cache = inMemoryCacheProvider({ ttl: 50 });
    cache.set('x', { _id: 'x' });
    expect(cache.get('x')).toBeDefined();
    await new Promise((r) => setTimeout(r, 100));
    expect(cache.get('x')).toBeUndefined();
  });

  it('delete removes a cached entry', () => {
    const cache = inMemoryCacheProvider();
    cache.set('a', { _id: 'a' });
    cache.delete('a');
    expect(cache.get('a')).toBeUndefined();
  });

  it('getMany returns documents for found keys and undefined for missing', () => {
    const cache = inMemoryCacheProvider();
    cache.set('k1', { _id: 'k1' });
    cache.set('k2', { _id: 'k2' });
    const results = cache.getMany(['k1', 'missing', 'k2']) as (
      | Record<string, unknown>
      | null
      | undefined
    )[];
    expect(results[0]).toEqual({ _id: 'k1' });
    expect(results[1]).toBeUndefined();
    expect(results[2]).toEqual({ _id: 'k2' });
  });

  it('setMany stores multiple documents retrievable via get', () => {
    const cache = inMemoryCacheProvider();
    cache.setMany([
      { key: 'a', value: { _id: 'a' } },
      { key: 'b', value: { _id: 'b' } },
    ]);
    expect(cache.get('a')).toEqual({ _id: 'a' });
    expect(cache.get('b')).toEqual({ _id: 'b' });
  });

  it('deleteMany removes multiple entries', () => {
    const cache = inMemoryCacheProvider();
    cache.setMany([
      { key: 'a', value: { _id: 'a' } },
      { key: 'b', value: { _id: 'b' } },
      { key: 'c', value: { _id: 'c' } },
    ]);
    cache.deleteMany(['a', 'b']);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toEqual({ _id: 'c' });
  });

  it('clear removes all entries', () => {
    const cache = inMemoryCacheProvider();
    cache.setMany([
      { key: 'a', value: { _id: 'a' } },
      { key: 'b', value: { _id: 'b' } },
    ]);
    cache.clear();
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeUndefined();
  });

  it('respects max — LRU entry is evicted when full', () => {
    const cache = inMemoryCacheProvider({ max: 2 });
    cache.set('a', { _id: 'a' });
    cache.set('b', { _id: 'b' });
    cache.get('a');
    cache.set('c', { _id: 'c' });
    expect(cache.get('a')).toBeDefined();
    expect(cache.get('c')).toBeDefined();
    expect(cache.get('b')).toBeUndefined();
  });

  it('returns values synchronously (not wrapped in Promises)', () => {
    const cache = inMemoryCacheProvider();
    cache.set('a', { _id: 'a' });
    const result = cache.get('a');
    expect(result).not.toBeInstanceOf(Promise);
    expect(result).toEqual({ _id: 'a' });
  });
});
