import { JSONSerializer } from '@event-driven-io/dumbo';
import { pongoCache } from './cache';
import { PongoDatabaseCache } from './database';
import type {
  AnyPongoDriver,
  ExtractPongoDatabaseTypeFromDriver,
} from './drivers';
import { pongoSession } from './pongoSession';
import {
  pongoSchema,
  type PongoClientSchema,
  type PongoClientSchemaFromDefinition,
  type PongoClientWithSchema,
  type PongoDbSchema,
} from './schema';
import type {
  PongoClient,
  PongoClientOptions,
  PongoDb,
  PongoDbOptions,
  PongoSession,
} from './typing';

const isPongoClientSchema = <T extends PongoClientSchema>(
  schema: T | PongoDbSchema | undefined,
): schema is T => schema !== undefined && 'dbs' in schema;

export const pongoClient = <
  DatabaseDriver extends AnyPongoDriver,
  SchemaDefinition extends PongoClientSchema | PongoDbSchema =
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
    databaseName: defaultDatabaseName,
    defaultSchemaName,
    migrationTable,
    ...connectionOptions
  } = options;

  const providedSchema = schema?.definition;
  const clientSchema = (
    providedSchema === undefined
      ? undefined
      : isPongoClientSchema(providedSchema)
        ? providedSchema
        : pongoSchema.client({
            [providedSchema.databaseName ??
            driver.dumboDriver.databaseMetadata.defaultDatabaseName]:
              providedSchema,
          })
  ) as TypedClientSchema | undefined;

  const dbClients = PongoDatabaseCache<PongoDb, TypedClientSchema>({
    driver,
    typedSchema: clientSchema,
    schemaDefinition: isPongoClientSchema(providedSchema)
      ? undefined
      : providedSchema,
  });

  const serializer = JSONSerializer.from(options);

  const cache =
    cacheOptions === 'disabled' || cacheOptions === undefined
      ? 'disabled'
      : pongoCache(cacheOptions);
  const schemaOptions =
    schema?.autoMigration === undefined
      ? {}
      : { autoMigration: schema.autoMigration };

  const core: PongoClient<
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
      const resolvedMigrationTable = options?.migrationTable ?? migrationTable;
      const db = dbClients.getOrCreate({
        ...connectionOptions,
        databaseName: dbName ?? defaultDatabaseName,
        defaultSchemaName: options?.defaultSchemaName ?? defaultSchemaName,
        hasExplicitDatabaseOptions: options !== undefined,
        ...(resolvedMigrationTable === undefined
          ? {}
          : { migrationTable: resolvedMigrationTable }),
        serializer,
        errors,
        schema: schemaOptions,
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

  const pongoClient = new Proxy(core, {
    get: (target, property) => {
      if (property in target) {
        return target[property as keyof typeof target];
      }
      if (typeof property !== 'string') return undefined;

      const database = clientSchema?.dbs[property];
      return database === undefined
        ? undefined
        : pongoClient.db(database.databaseName ?? property);
    },
  });

  return pongoClient as PongoClientWithSchema<
    TypedClientSchema,
    DatabaseDriver['driverType'],
    ExtractPongoDatabaseTypeFromDriver<DatabaseDriver>
  >;
};
