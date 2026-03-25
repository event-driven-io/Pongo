import { describe, expect, it } from 'vitest';
import { pongoCache } from './pongoCache';
import { identityMapCache } from './providers';

describe('pongoCache factory', () => {
  describe("'identity-map' type", () => {
    it('creates an identity-map cache when type is identity-map', async () => {
      const cache = pongoCache({ type: 'identity-map' });

      expect(cache.cacheType).toBe('pongo:cache:identity-map');

      await cache.set('db:col:1', { _id: '1', name: 'Alice' });
      const result = await cache.get('db:col:1');
      expect(result).toEqual({ _id: '1', name: 'Alice' });
    });

    it('identity-map cache has no max size eviction', async () => {
      const cache = pongoCache({ type: 'identity-map' });
      const count = 2000;

      for (let i = 0; i < count; i++) {
        await cache.set(`db:col:${i}`, { _id: String(i), n: i });
      }

      for (let i = 0; i < count; i++) {
        const doc = await cache.get(`db:col:${i}`);
        expect(doc).not.toBeNull();
      }
    });
  });

  describe("'in-memory' type", () => {
    it('creates an LRU cache when type is in-memory', () => {
      const cache = pongoCache({ type: 'in-memory', max: 100 });
      expect(cache.cacheType).toBe('pongo:cache:lru');
    });

    it('defaults to disabled when no config provided', async () => {
      const cache = pongoCache();

      await cache.set('db:col:1', { _id: '1', name: 'Bob' });
      const result = await cache.get('db:col:1');
      expect(result).toBeUndefined();
    });

    it('in-memory LRU evicts when over max', async () => {
      const cache = pongoCache({ type: 'in-memory', max: 3 });

      for (let i = 0; i < 4; i++) {
        await cache.set(`db:col:${i}`, { _id: String(i) });
      }

      // Oldest entry should be evicted
      const first = await cache.get('db:col:0');
      expect(first).toBeUndefined();
    });
  });

  describe("'disabled'", () => {
    it('returns noop cache when disabled', async () => {
      const cache = pongoCache('disabled');

      await cache.set('db:col:1', { _id: '1', name: 'Carol' });
      const result = await cache.get('db:col:1');
      expect(result).toBeUndefined();
    });
  });

  describe('pre-built PongoCache passthrough', () => {
    it('passes through a pre-built PongoCache instance', () => {
      const raw = identityMapCache();
      const cache = pongoCache(raw);
      expect(cache).toBe(raw);
    });
  });
});
