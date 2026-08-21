import { PongoError } from './core';
import type { AnyPongoDriver as PongoDriverForLoader } from './core/drivers';

export * from './core';
export type { AnyPongoDriver } from './core/drivers/databaseDriver';

pongoDriverRegistry.register(`PostgreSQL:pg`, () => loadPongoClient('pg'));
pongoDriverRegistry.register(`SQLite:sqlite3`, () =>
  loadPongoClient('sqlite3'),
);
pongoDriverRegistry.register(`SQLite:d1`, () => loadPongoClient('d1'));

export const loadPongoClient = async (
  path: 'pg' | 'sqlite3' | 'd1',
): Promise<PongoDriverForLoader> => {
  let module;

  if (path === 'pg') {
    module = await import('./pg');
  } else if (path === 'sqlite3') {
    module = await import('./sqlite3');
  } else if (path === 'd1') {
    module = await import('./cloudflare');
  } else {
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    throw new PongoError(`Unknown path: ${path}`);
  }

  if (!module.pongoDriver) {
    throw new PongoError(`Failed to load Pongo client for ${path}`);
  }

  return module.pongoDriver;
};
