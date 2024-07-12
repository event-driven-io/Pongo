import { getDatabaseNameOrDefault } from '@event-driven-io/dumbo';
import { getDbClient, type DbClient } from './dbClient';
import type { PongoClient, PongoDb } from './typing/operations';

export const pongoClient = (connectionString: string): PongoClient => {
  const defaultDbName = getDatabaseNameOrDefault(connectionString);
  const dbClients: Map<string, DbClient> = new Map();

  const dbClient = getDbClient(connectionString);
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
          .set(dbName, getDbClient(connectionString, dbName))
          .get(dbName)!
      );
    },
  };

  return pongoClient;
};
