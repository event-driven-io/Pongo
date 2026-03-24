import { pongoCacheWrapper } from './cacheWrapper';
import { noopCacheProvider, lruCache, identityMapCache } from './providers';
import type { CacheConfig, CacheSettings, PongoCache } from './types';

const DEFAULT_CONFIG: CacheSettings = { type: 'in-memory', max: 1000 };

export const pongoCache = (
  options: CacheConfig | 'disabled' | PongoCache | undefined,
): PongoCache => {
  if (options === 'disabled') return noopCacheProvider;

  if (options !== undefined && 'cacheType' in options)
    return options as PongoCache;

  const config = options ?? DEFAULT_CONFIG;

  if (config.type === 'identity-map') return identityMapCache();

  const raw = lruCache({
    ...(config.max !== undefined ? { max: config.max } : {}),
    ...(config.ttl !== undefined ? { ttl: config.ttl } : {}),
  });
  return pongoCacheWrapper({ provider: raw });
};
