import {
  type DatabaseConnectionString,
  type InferDriverDatabaseType,
} from '@event-driven-io/dumbo';
import { PongoDatabaseCache } from './database';
import type {
  AnyPongoDatabaseDriver,
  ExtractPongoDatabaseTypeFromDriver,
} from './drivers';
import { pongoSession } from './pongoSession';
import {
  proxyClientWithSchema,
  type PongoClientSchema,
  type PongoClientWithSchema,
} from './schema';
import type {
  PongoClient,
  PongoClientOptions,
  PongoDb,
  PongoSession,
} from './typing';

export const pongoClient = <
  DatabaseDriver extends AnyPongoDatabaseDriver,
  ConnectionString extends DatabaseConnectionString<
    InferDriverDatabaseType<DatabaseDriver['driverType']>
  >,
  TypedClientSchema extends PongoClientSchema = PongoClientSchema,
>(
  options: PongoClientOptions<
    DatabaseDriver,
    ConnectionString,
    TypedClientSchema
  >,
): PongoClient<
  DatabaseDriver['driverType'],
  ExtractPongoDatabaseTypeFromDriver<DatabaseDriver>
> &
  PongoClientWithSchema<TypedClientSchema> => {
  const { driver, connectionString, schema, errors, ...connectionOptions } =
    options;

  const dbClients = PongoDatabaseCache<PongoDb, TypedClientSchema>({
    driver,
    typedSchema: schema?.definition,
  });

  const pongoClient: PongoClient<
    DatabaseDriver['driverType'],
    ExtractPongoDatabaseTypeFromDriver<DatabaseDriver>
  > = {
    driverType: driver.driverType,
    connect: async () => {
      await dbClients.forAll((db) => db.connect());
      return pongoClient;
    },
    close: async () => {
      await dbClients.forAll((db) => db.close());
    },
    db: (
      dbName?: string,
    ): ExtractPongoDatabaseTypeFromDriver<DatabaseDriver> => {
      const db = dbClients.getOrCreate({
        ...connectionOptions,
        connectionString,
        databaseName: dbName,
        errors,
      });

      return db as ExtractPongoDatabaseTypeFromDriver<DatabaseDriver>;
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

  return proxyClientWithSchema(pongoClient, schema?.definition);
};
