import { pongoCacheWrapper } from './cacheWrapper';
import { resolveCacheConfig } from './configResolution';
import { noopCacheProvider, lruCache } from './providers';
import type { CacheConfig, PongoCache } from './types';

export const pongoCache = (
  options: CacheConfig | 'disabled' | PongoCache | undefined,
): PongoCache => {
  if (options === 'disabled') return noopCacheProvider;

  if (options !== undefined && 'cacheType' in options)
    return options as PongoCache;

  const config = resolveCacheConfig(options);

  if (config === 'disabled') return noopCacheProvider;

  const raw = lruCache({
    ...(config.max !== undefined ? { max: config.max } : {}),
    ...(config.ttl !== undefined ? { ttl: config.ttl } : {}),
  });
  return pongoCacheWrapper({ provider: raw });
};
