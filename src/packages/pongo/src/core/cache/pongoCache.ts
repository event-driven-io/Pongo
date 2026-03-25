import { pongoCacheWrapper } from './cacheWrapper';
import { identityMapCache, lruCache, noopCacheProvider } from './providers';
import type { CacheConfig, CacheSettings, PongoCache } from './types';

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
