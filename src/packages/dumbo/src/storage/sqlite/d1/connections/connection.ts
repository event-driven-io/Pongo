import { type D1Database } from '@cloudflare/workers-types';
import {
  type Parameters,
  type SQLiteClient,
  type SQLiteConnection,
  type SQLiteConnectionOptions,
  type SQLiteDriverType,
  sqliteAmbientClientConnection,
} from '../../core';

export type D1DriverType = SQLiteDriverType<'d1'>;
export const D1DriverType: D1DriverType = 'SQLite:d1';

export type D1ClientOptions = {
  database: D1Database;
};

export type D1Client = SQLiteClient & {
  database: D1Database;
};

export type D1Connection = SQLiteConnection<D1DriverType, D1Client>;

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

export type D1ConnectionOptions = SQLiteConnectionOptions & D1ClientOptions;

export const d1Connection = (options: D1ConnectionOptions) =>
  sqliteAmbientClientConnection<D1Connection>({
    driverType: D1DriverType,
    client: d1Client(options),
  });
