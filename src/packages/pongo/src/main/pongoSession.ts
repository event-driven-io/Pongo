import type { PongoClientOptions } from './pongoClient';
import type { PongoSession } from './typing';

export const pongoSession = (
  _clientOptions: PongoClientOptions,
): PongoSession => {
  throw new Error('Not Implemented!');
};
