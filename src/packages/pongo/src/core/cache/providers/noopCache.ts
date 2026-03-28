import type { PongoCache } from '../pongoCache';

export const noopCacheProvider: PongoCache = {
  cacheType: 'pongo:cache:no-op',
  get: () => undefined,
  set: () => {},
  update: () => {},
  delete: () => {},
  getMany: (keys) => keys.map(() => undefined),
  setMany: () => {},
  replaceMany: () => {},
  updateMany: () => {},
  deleteMany: () => {},
  clear: () => {},
  close: () => {},
};
