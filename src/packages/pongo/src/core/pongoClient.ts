import {
  type DatabaseConnectionString,
  type MigrationStyle,
} from '@event-driven-io/dumbo';
import { NodePostgresConnectorType } from '@event-driven-io/dumbo/pg';
import type { PostgresDbClientOptions } from '../storage/postgresql';
import { getPongoDb } from './pongoDb';
import { pongoSession } from './pongoSession';
import {
  proxyClientWithSchema,
  type PongoClientSchema,
  type PongoClientWithSchema,
} from './schema';
import type { PongoClient, PongoDb, PongoSession } from './typing';
import type { NodePostgresPongoClientOptions } from '../pg';

export type PongoClientOptions<
  TypedClientSchema extends PongoClientSchema = PongoClientSchema,
> = {
  schema?: { autoMigration?: MigrationStyle; definition?: TypedClientSchema };
  errors?: { throwOnOperationFailures?: boolean };
  connectionOptions?: NodePostgresPongoClientOptions;
};

export const pongoClient = <
  ConnectionString extends DatabaseConnectionString,
  TypedClientSchema extends PongoClientSchema = PongoClientSchema,
  DbClientOptions extends PostgresDbClientOptions = PostgresDbClientOptions,
>(
  connectionString: ConnectionString,
  options: PongoClientOptions<TypedClientSchema> = {},
): PongoClient & PongoClientWithSchema<TypedClientSchema> => {
  const dbClients = new Map<string, PongoDb>();

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

export const clientToDbOptions = <
  ConnectionString extends DatabaseConnectionString,
  DbClientOptions extends PostgresDbClientOptions = PostgresDbClientOptions,
>(options: {
  connectionString: ConnectionString;
  dbName?: string;
  clientOptions: PongoClientOptions;
}): DbClientOptions => {
  const postgreSQLOptions: PostgresDbClientOptions = {
    connector: NodePostgresConnectorType,
    connectionString: options.connectionString,
    dbName: options.dbName,
    ...options.clientOptions,
  };

  return postgreSQLOptions as DbClientOptions;
};
