import pg from 'pg';
import type { PostgresDbClientOptions } from '../postgres';
import {
  getDbClient,
  type AllowedDbClientOptions,
  type DbClient,
} from './dbClient';
import type { PongoClient, PongoDb, PongoSession } from './typing/operations';

export type PongoClientOptions = { client?: pg.PoolClient | pg.Client };

export const pongoClient = <
  DbClientOptions extends AllowedDbClientOptions = AllowedDbClientOptions,
>(
  connectionString: string,
  options: PongoClientOptions = {},
): PongoClient => {
  const dbClients: Map<string, DbClient<DbClientOptions>> = new Map();

  const dbClient = getDbClient<DbClientOptions>(
    clientToDbOptions({
      connectionString,
      clientOptions: options,
    }),
  );
  dbClients.set(dbClient.databaseName, dbClient);

  const startSession = (): PongoSession => {
    throw new Error('Not Implemented!');
  };

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
            getDbClient<DbClientOptions>(
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
    startSession,
    withSession<T = unknown>(
      _callback: (session: PongoSession) => Promise<T>,
    ): Promise<T> {
      return Promise.reject('Not Implemented!');
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
    type: 'PostgreSQL',
    connectionString: options.connectionString,
    dbName: options.dbName,
    ...(options.clientOptions.client
      ? { client: options.clientOptions.client }
      : {}),
  };

  return postgreSQLOptions as DbClientOptions;
};
