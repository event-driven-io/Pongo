import pg from 'pg';
import type { PostgresDbClientOptions } from '../postgres';
import { getPongoDb, type AllowedDbClientOptions } from './pongoDb';
import { pongoSession } from './pongoSession';
import type { PongoClient, PongoDb, PongoSession } from './typing/operations';

export type PooledPongoClientOptions =
  | {
      pool: pg.Pool;
    }
  | {
      pooled: true;
    }
  | {
      pool: pg.Pool;
      pooled: true;
    }
  // eslint-disable-next-line @typescript-eslint/ban-types
  | {};

export type NotPooledPongoOptions =
  | {
      client: pg.Client;
    }
  | {
      pooled: false;
    }
  | {
      client: pg.Client;
      pooled: false;
    };

export type PongoClientOptions =
  | PooledPongoClientOptions
  | NotPooledPongoOptions;

export const pongoClient = <
  DbClientOptions extends AllowedDbClientOptions = AllowedDbClientOptions,
>(
  connectionString: string,
  options: PongoClientOptions = {},
): PongoClient => {
  const dbClients: Map<string, PongoDb> = new Map();

  const dbClient = getPongoDb<DbClientOptions>(
    clientToDbOptions({
      connectionString,
      clientOptions: options,
    }),
  );
  dbClients.set(dbClient.databaseName, dbClient);

  const pongoClient: PongoClient = {
    connect: async () => {
      await dbClient.connect();
      return pongoClient;
    },
    close: async () => {
      for (const db of dbClients.values()) {
        await db.close();
      }
    },
    db: (dbName?: string): PongoDb => {
      if (!dbName) return dbClient;

      return (
        dbClients.get(dbName) ??
        dbClients
          .set(
            dbName,
            getPongoDb<DbClientOptions>(
              clientToDbOptions({
                connectionString,
                dbName,
                clientOptions: options,
              }),
            ),
          )
          .get(dbName)!
      );
    },
    startSession: pongoSession,
    withSession: async <T = unknown>(
      callback: (session: PongoSession) => Promise<T>,
    ): Promise<T> => {
      const session = pongoSession();

      try {
        return await callback(session);
      } finally {
        await session.endSession();
      }
    },
  };

  return pongoClient;
};

export const clientToDbOptions = <
  DbClientOptions extends AllowedDbClientOptions = AllowedDbClientOptions,
>(options: {
  connectionString: string;
  dbName?: string;
  clientOptions: PongoClientOptions;
}): DbClientOptions => {
  const postgreSQLOptions: PostgresDbClientOptions = {
    dbType: 'PostgreSQL',
    connectionString: options.connectionString,
    dbName: options.dbName,
    ...options.clientOptions,
  };

  return postgreSQLOptions as DbClientOptions;
};
