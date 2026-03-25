import type { PongoCache } from '../types';

export const noopCacheProvider: PongoCache = {
  cacheType: 'pongo:cache:no-op',
  get: () => undefined,
  set: () => {},
  update: () => {},
  delete: () => {},
  getMany: () => [],
  setMany: () => {},
  updateMany: () => {},
  deleteMany: () => {},
  clear: () => {},
  close: () => {},
};
