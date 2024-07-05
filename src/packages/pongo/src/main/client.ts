import { getDbClient } from './dbClient';
import type { PongoClient, PongoDb } from './typing';

export const pongoClient = (connectionString: string): PongoClient => {
  const dbClient = getDbClient(connectionString);

  return {
    connect: () => dbClient.connect(),
    close: () => dbClient.close(),
    db: (dbName?: string): PongoDb =>
      dbName ? getDbClient(connectionString, dbName) : dbClient,
  };
};
