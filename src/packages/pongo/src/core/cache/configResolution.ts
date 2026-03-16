import type { CacheConfig, CacheConfigObject } from './types';

const DEFAULT_CONFIG: CacheConfigObject = { type: 'in-memory', max: 1000 };

// Keys that are "common" (not type-specific)
const COMMON_KEYS = new Set(['type', 'max', 'ttl']);

const mergeConfigs = (
  parent: CacheConfigObject,
  child: CacheConfigObject,
): CacheConfigObject => {
  const sameType = parent.type === child.type;

  // Start with common inherited fields from parent
  const base: CacheConfigObject = { type: child.type };
  if (parent.max !== undefined) base.max = parent.max;
  if (parent.ttl !== undefined) base.ttl = parent.ttl;

  if (sameType) {
    // Carry type-specific extras from parent
    for (const [key, val] of Object.entries(parent)) {
      if (!COMMON_KEYS.has(key)) base[key] = val;
    }
  }
  // (if different type: type-specific extras are NOT inherited)

  // Apply child overrides
  if (child.max !== undefined) base.max = child.max;
  if (child.ttl !== undefined) base.ttl = child.ttl;

  // Apply child type-specific extras
  for (const [key, val] of Object.entries(child)) {
    if (!COMMON_KEYS.has(key)) base[key] = val;
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

    // config is a CacheConfigObject
    if (resolved === 'disabled') {
      // Child explicitly re-enables with an object — start fresh from DEFAULT + child
      resolved = mergeConfigs(DEFAULT_CONFIG, config);
      continue;
    }

    resolved = mergeConfigs(resolved as CacheConfigObject, config);
  }

  return resolved;
};
