import type { CacheConfig, CacheConfigObject } from './types';

const DEFAULT_CONFIG: CacheConfigObject = { type: 'in-memory', max: 1000 };

const COMMON_KEYS = new Set(['type', 'max', 'ttl']);

const isTypeSpecificKey = (key: string) => !COMMON_KEYS.has(key);

const mergeConfigs = (
  parent: CacheConfigObject,
  child: CacheConfigObject,
): CacheConfigObject => {
  const base: CacheConfigObject = { type: child.type };

  if (parent.max !== undefined) base.max = parent.max;
  if (parent.ttl !== undefined) base.ttl = parent.ttl;

  if (parent.type === child.type) {
    for (const [key, val] of Object.entries(parent)) {
      if (isTypeSpecificKey(key)) base[key] = val;
    }
  }

  if (child.max !== undefined) base.max = child.max;
  if (child.ttl !== undefined) base.ttl = child.ttl;

  for (const [key, val] of Object.entries(child)) {
    if (isTypeSpecificKey(key)) base[key] = val;
  }

  return base;
};

export const resolveCacheConfig = (
  ...configs: (CacheConfig | undefined)[]
): CacheConfig => {
  let resolved: CacheConfig = DEFAULT_CONFIG;

  for (const config of configs) {
    if (config === undefined) continue;

    if (config === 'disabled') {
      resolved = 'disabled';
      continue;
    }

    resolved = mergeConfigs(
      resolved === 'disabled' ? DEFAULT_CONFIG : resolved,
      config,
    );
  }

  return resolved;
};
