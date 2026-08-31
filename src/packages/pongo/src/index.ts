import { PongoError } from './core';
import type { AnyPongoDriver as PongoDriverForLoader } from './core/drivers';

export * from './core';
export type { AnyPongoDriver } from './core/drivers/databaseDriver';

pongoDriverRegistry.register(`PostgreSQL:pg`, () => loadPongoClient('pg'));
pongoDriverRegistry.register(`SQLite:sqlite3`, () =>
  loadPongoClient('sqlite3'),
);
pongoDriverRegistry.register(`SQLite:d1`, () => loadPongoClient('d1'));
pongoDriverRegistry.register(`SQLite:cloudflareDurableObjectSQLite`, () =>
  loadPongoClient('cloudflareDurableObjectSQLite'),
);

export const loadPongoClient = async (
  path: 'pg' | 'sqlite3' | 'd1' | 'cloudflareDurableObjectSQLite',
): Promise<PongoDriverForLoader> => {
  let pongoDriver: PongoDriverForLoader | undefined;

  if (path === 'pg') {
    const module = await import('./pg');
    pongoDriver = module.pongoDriver;
  } else if (path === 'sqlite3') {
    const module = await import('./sqlite3');
    pongoDriver = module.pongoDriver;
  } else if (path === 'd1') {
    const module = await import('./cloudflare');
    pongoDriver = module.d1Driver;
  } else if (path === 'cloudflareDurableObjectSQLite') {
    const module = await import('./cloudflare');
    pongoDriver = module.cloudflareDurableObjectSQLiteDriver;
  } else {
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    throw new PongoError(`Unknown path: ${path}`);
  }

  if (!pongoDriver) {
    throw new PongoError(`Failed to load Pongo client for ${path}`);
  }

  return pongoDriver;
};
