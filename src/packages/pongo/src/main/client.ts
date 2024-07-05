import { getDbClient } from './dbClient';
import type { PongoClient, PongoDb } from './typing';

export const pongoClient = (connectionString: string): PongoClient => {
  const dbClient = getDbClient(connectionString);

  const pongoClient: PongoClient = {
    connect: async () => {
      await dbClient.connect();
      return pongoClient;
    },
    close: () => dbClient.close(),
    db: (dbName?: string): PongoDb =>
      dbName ? getDbClient(connectionString, dbName) : dbClient,
  };

  return pongoClient;
};
