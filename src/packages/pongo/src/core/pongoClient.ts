import {
  parseConnectionString,
  type ConnectorType,
  type DatabaseConnectionString,
  type InferConnectorDatabaseType,
  type MigrationStyle,
} from '@event-driven-io/dumbo';
import { getPongoDb, type PongoDbClientOptions } from './database/pongoDb';
import { pongoSession } from './pongoSession';
import {
  proxyClientWithSchema,
  type PongoClientSchema,
  type PongoClientWithSchema,
} from './schema';
import type { PongoClient, PongoDb, PongoSession } from './typing';

export type PongoClientOptions<
  ConnectionString extends DatabaseConnectionString<
    InferConnectorDatabaseType<Connector>
  >,
  Connector extends ConnectorType = ConnectorType,
  TypedClientSchema extends PongoClientSchema = PongoClientSchema,
  ConnectionOptions = unknown,
> = {
  connectionString: ConnectionString | string;
  schema?:
    | { autoMigration?: MigrationStyle; definition?: TypedClientSchema }
    | undefined;
  errors?: { throwOnOperationFailures?: boolean } | undefined;
  connectionOptions?: ConnectionOptions | undefined;
};

export const pongoClient = <
  ConnectionString extends DatabaseConnectionString<
    InferConnectorDatabaseType<Connector>
  >,
  TypedClientSchema extends PongoClientSchema = PongoClientSchema,
  Connector extends ConnectorType = ConnectorType,
  DbClientOptions extends PongoDbClientOptions<
    ConnectionString,
    Connector
  > = PongoDbClientOptions<ConnectionString, Connector>,
>(
  options: PongoClientOptions<ConnectionString, Connector, TypedClientSchema>,
): PongoClient & PongoClientWithSchema<TypedClientSchema> => {
  const dbClients = new Map<string, PongoDb>();

  const { connectionString } = options;

  const { databaseType, driverName } = parseConnectionString(connectionString);

  const connector: Connector = `${databaseType}:${driverName}` as Connector;

  const dbClient = getPongoDb<ConnectionString, Connector, DbClientOptions>({
    connector,
    connectionString: connectionString as ConnectionString,
    clientOptions: options,
    dbSchemaComponent: undefined!, // TODO: Add dbSchemaComponent resolution
  });
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
            getPongoDb<ConnectionString, Connector, DbClientOptions>({
              connector,
              connectionString: connectionString as ConnectionString,
              clientOptions: options,
              dbSchemaComponent: undefined!, // TODO: Add dbSchemaComponent resolution
            }),
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
