import type { PongoCache } from '../types';

export const noopCacheProvider: PongoCache = {
  type: 'pongo:cache:no-op',
  get: async () => await Promise.resolve(null),
  set: () => {},
  update: () => {},
  delete: () => {},
  getMany: () => [],
  setMany: () => {},
  updateMany: () => {},
  deleteMany: () => {},
  clear: () => {},
};
