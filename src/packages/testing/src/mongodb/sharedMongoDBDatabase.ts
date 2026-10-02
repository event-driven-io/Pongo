import { randomUUID } from 'crypto';
import { MongoClient } from 'mongodb';
import { inject } from 'vitest';

declare module 'vitest' {
  export interface ProvidedContext {
    sharedMongoDBConnectionString: string;
  }
}

export type SharedMongoDBDatabase = {
  connectionString: string;
  databaseName: string;
  close: () => Promise<void>;
};

const withDatabaseName = (
  serverConnectionString: string,
  databaseName: string,
): string => {
  const url = new URL(serverConnectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
};

/**
 * Gives the caller its own database on the mongod shared by the whole run.
 * MongoDB creates a database on first write, so unlike PostgreSQL there is
 * nothing to create up front, only a name to keep to ourselves.
 */
export const sharedMongoDBDatabase = (): SharedMongoDBDatabase => {
  const serverConnectionString = inject('sharedMongoDBConnectionString');
  const databaseName = `test_${randomUUID().replaceAll('-', '')}`;

  return {
    connectionString: withDatabaseName(serverConnectionString, databaseName),
    databaseName,
    close: async () => {
      const client = new MongoClient(serverConnectionString, {
        directConnection: true,
      });
      await client.connect();

      try {
        await client.db(databaseName).dropDatabase();
      } finally {
        await client.close();
      }
    },
  };
};
