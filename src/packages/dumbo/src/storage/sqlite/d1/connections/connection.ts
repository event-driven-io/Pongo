import { type D1Database } from '@cloudflare/workers-types';
import type { SQLiteDriverType } from '../../core';
import { type Parameters, type SQLiteClient } from '../../core/connections';

export type D1DriverType = SQLiteDriverType<'d1'>;
export const D1DriverType: D1DriverType = 'SQLite:d1';

export type D1ClientOptions = {
  database: D1Database;
};

export type D1Client = SQLiteClient & {
  database: D1Database;
};

export const d1Client = (options: D1ClientOptions): D1Client => {
  const { database } = options;

  return {
    database,
    connect: () => Promise.resolve(),
    close: () => Promise.resolve(),

    command: async (sql: string, params?: Parameters[]) => {
      const stmt = database.prepare(sql);
      const bound = params?.length ? stmt.bind(...params) : stmt;
      await bound.run();
    },

    query: async <T>(sql: string, params?: Parameters[]): Promise<T[]> => {
      const stmt = database.prepare(sql);
      const bound = params?.length ? stmt.bind(...params) : stmt;
      const { results } = await bound.all<T>();
      return results;
    },

    querySingle: async <T>(
      sql: string,
      params?: Parameters[],
    ): Promise<T | null> => {
      const stmt = database.prepare(sql);
      const bound = params?.length ? stmt.bind(...params) : stmt;
      return await bound.first<T>();
    },
  };
};
