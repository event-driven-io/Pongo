import {
  JSONSerializer,
  type AnySchemaComponent,
} from '@event-driven-io/dumbo';
import { pongoCache } from './cache';
import {
  PongoDatabaseCache,
  pongoClientSchemaFromDefinition,
  type PongoClientSchemaFromDefinition,
} from './database';
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
  PongoDbOptions,
  PongoSession,
} from './typing';

const isPongoClientSchema = <T extends PongoClientSchema>(
  schema: T | AnySchemaComponent | undefined,
): schema is T => schema !== undefined && 'dbs' in schema;

export const pongoClient = <
  DatabaseDriver extends AnyPongoDriver,
  SchemaDefinition extends PongoClientSchema | AnySchemaComponent =
    PongoClientSchema,
  TypedClientSchema extends PongoClientSchema =
    PongoClientSchemaFromDefinition<SchemaDefinition>,
>(
  options: PongoClientOptions<DatabaseDriver, SchemaDefinition>,
): PongoClient<
  DatabaseDriver['driverType'],
  ExtractPongoDatabaseTypeFromDriver<DatabaseDriver>
> &
  PongoClientWithSchema<TypedClientSchema> => {
  const {
    driver,
    schema,
    errors,
    cache: cacheOptions,
    serialization,
    ...connectionOptions
  } = options;

  const typedSchema = pongoClientSchemaFromDefinition(schema?.definition) as
    TypedClientSchema | undefined;

  const dbClients = PongoDatabaseCache<PongoDb, TypedClientSchema>({
    driver,
    typedSchema,
    schemaDefinition: isPongoClientSchema(schema?.definition)
      ? undefined
      : schema?.definition,
  });

  const serializer = JSONSerializer.from(options);

  const cache =
    cacheOptions === 'disabled' || cacheOptions === undefined
      ? 'disabled'
      : pongoCache(cacheOptions);

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
      options?: PongoDbOptions,
    ): ExtractPongoDatabaseTypeFromDriver<DatabaseDriver> => {
      const db = dbClients.getOrCreate({
        ...connectionOptions,
        databaseName: dbName,
        serializer,
        errors,
        ...(schema?.autoMigration
          ? { schema: { autoMigration: schema.autoMigration } }
          : {}),
        cache: options?.cache ?? cache,
        serialization,
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

  return proxyClientWithSchema(pongoClient, typedSchema);
};
