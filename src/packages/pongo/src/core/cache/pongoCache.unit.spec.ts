import { describe, expect, it } from 'vitest';
import { pongoCache } from './pongoCache';
import { identityMapCache } from './providers';

describe('pongoCache factory', () => {
  it("creates an identity-map cache when type is 'identity-map'", () => {
    const cache = pongoCache({ type: 'identity-map' });
    expect(cache.cacheType).toBe('pongo:cache:identity-map');
  });

  it("creates an LRU cache when type is 'in-memory'", () => {
    const cache = pongoCache({ type: 'in-memory', max: 100 });
    expect(cache.cacheType).toBe('pongo:cache:lru');
  });

  it('returns noop cache when no config provided', () => {
    const cache = pongoCache();
    expect(cache.cacheType).toBe('pongo:cache:no-op');
  });

  it("returns noop cache when 'disabled'", () => {
    const cache = pongoCache('disabled');
    expect(cache.cacheType).toBe('pongo:cache:no-op');
  });

  it('passes through a pre-built PongoCache instance', () => {
    const raw = identityMapCache();
    const cache = pongoCache(raw);
    expect(cache).toBe(raw);
  });
});
