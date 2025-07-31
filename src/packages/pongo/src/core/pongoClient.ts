import {
  type MigrationStyle,
  type SupportedDatabaseConnectionString,
} from '@event-driven-io/dumbo';
import type { NodePostgresPongoClientOptions } from '../pg';
import { clientToDbOptions } from '../storage/all';
import type { PostgresDbClientOptions } from '../storage/postgresql';
import { getPongoDb } from './pongoDb';
import { pongoSession } from './pongoSession';
import {
  proxyClientWithSchema,
  type PongoClientSchema,
  type PongoClientWithSchema,
} from './schema';
import type { PongoClient, PongoDb, PongoSession } from './typing';

export type PongoClientOptions<
  ConnectionString extends SupportedDatabaseConnectionString,
  TypedClientSchema extends PongoClientSchema = PongoClientSchema,
  ConnectionOptions extends
    NodePostgresPongoClientOptions = NodePostgresPongoClientOptions,
> = {
  connectionString: ConnectionString;
  schema?:
    | { autoMigration?: MigrationStyle; definition?: TypedClientSchema }
    | undefined;
  errors?: { throwOnOperationFailures?: boolean } | undefined;
  connectionOptions?: ConnectionOptions | undefined;
};

export const pongoClient = <
  ConnectionString extends SupportedDatabaseConnectionString,
  TypedClientSchema extends PongoClientSchema = PongoClientSchema,
  DbClientOptions extends
    PostgresDbClientOptions<ConnectionString> = PostgresDbClientOptions<ConnectionString>,
>(
  options: PongoClientOptions<ConnectionString, TypedClientSchema>,
): PongoClient & PongoClientWithSchema<TypedClientSchema> => {
  const dbClients = new Map<string, PongoDb>();

  const dbClient = getPongoDb<ConnectionString, DbClientOptions>(
    clientToDbOptions({
      connectionString: options.connectionString,
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
            getPongoDb<ConnectionString, DbClientOptions>(
              clientToDbOptions({
                connectionString: options.connectionString,
                dbName,
                clientOptions: options,
              }),
            ),
          )
          .get(dbName)!
      );
    },
    startSession: pongoSession,
    withSession: async <T>(
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

  return proxyClientWithSchema(pongoClient, options?.schema?.definition);
};
