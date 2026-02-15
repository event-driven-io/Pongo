import { JSONSerializer } from '@event-driven-io/dumbo';
import { PongoDatabaseCache } from './database';
import type {
  AnyPongoDriver,
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
  DatabaseDriver extends AnyPongoDriver,
  TypedClientSchema extends PongoClientSchema = PongoClientSchema,
>(
  options: PongoClientOptions<DatabaseDriver, TypedClientSchema>,
): PongoClient<
  DatabaseDriver['driverType'],
  ExtractPongoDatabaseTypeFromDriver<DatabaseDriver>
> &
  PongoClientWithSchema<TypedClientSchema> => {
  const { driver, schema, errors, ...connectionOptions } = options;

  const dbClients = PongoDatabaseCache<PongoDb, TypedClientSchema>({
    driver,
    typedSchema: schema?.definition,
  });

  const serializer = JSONSerializer.from(options);

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
        databaseName: dbName,
        serializer,
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
