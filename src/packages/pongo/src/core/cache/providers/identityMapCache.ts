import type { PongoDocument } from '../../typing';
import type { PongoCache } from '../types';

export const identityMapCache = (): PongoCache => {
  const store = new Map<string, PongoDocument>();

  return {
    cacheType: 'pongo:cache:identity-map',
    get: (key) => Promise.resolve(store.get(key) ?? null),
    set: (key, value) => {
      store.set(key, value);
    },
    update: (key, _updater) => {
      // TODO: Implement proper update logic instead of just setting the updater as value
      store.delete(key);
      // const existing = store.get(key);
      // if (!existing) return;
      // const updated = typeof updater === 'function' ? updater(existing) : updater;
      // store.set(key, updated);
    },
    delete: (key) => {
      store.delete(key);
    },
    getMany: (keys) => Promise.resolve(keys.map((k) => store.get(k) ?? null)),
    setMany: (entries) => {
      for (const { key, value } of entries) store.set(key, value);
    },
    updateMany: (keys, _updater) => {
      // TODO: Implement proper update logic instead of just setting the updater as value
      for (const key of keys) store.delete(key);
      // for (const key of keys) {
      //   const existing = store.get(key);
      //   if (!existing) continue;
      //   const updated = typeof updater === 'function' ? updater(existing) : updater;
      //   store.set(key, updated);
      // }
    },
    deleteMany: (keys) => {
      for (const key of keys) store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
};
