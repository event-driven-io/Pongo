import { getDatabaseNameOrDefault } from '@event-driven-io/dumbo';
import pg from 'pg';
import { getDbClient, type DbClient } from './dbClient';
import type { PongoClient, PongoDb, PongoSession } from './typing/operations';

export const pongoClient = (
  connectionString: string,
  options: { client?: pg.PoolClient | pg.Client } = {},
): PongoClient => {
  const defaultDbName = getDatabaseNameOrDefault(connectionString);
  const dbClients: Map<string, DbClient> = new Map();

  const dbClient = getDbClient({ connectionString, client: options.client });
  dbClients.set(defaultDbName, dbClient);

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
            getDbClient({
              connectionString,
              dbName: dbName,
              client: options.client,
            }),
          )
          .get(dbName)!
      );
    },

    startSession(): PongoSession {
      throw new Error('Not Implemented!');
    },
    withSession<T = unknown>(
      _callback: (session: PongoSession) => Promise<T>,
    ): Promise<T> {
      return Promise.reject('Not Implemented!');
    },
  };

  return pongoClient;
};
