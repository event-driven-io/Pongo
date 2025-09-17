import type { ConnectorType, MigrationStyle } from '@event-driven-io/dumbo';
import type {
  PongoDatabaseDriver,
  PongoDatabaseFactoryOptions,
} from '../plugins';
import type { PongoClientSchema, PongoCollectionSchema } from '../schema';
import type { PongoDb } from '../typing';

export const PongoDatabaseCache = <
  Database extends PongoDb<ConnectorType> = PongoDb<ConnectorType>,
  TypedClientSchema extends PongoClientSchema = PongoClientSchema,
>({
  driver,
  typedSchema,
}: {
  driver: PongoDatabaseDriver<Database>;
  typedSchema?: TypedClientSchema | undefined;
}) => {
  const dbClients = new Map<string, PongoDb>();

  return {
    getOrCreate: <
      CollectionsSchema extends Record<string, PongoCollectionSchema> = Record<
        string,
        PongoCollectionSchema
      >,
    >(
      createOptions: Omit<
        PongoDatabaseFactoryOptions<CollectionsSchema>,
        'schema'
      > & {
        schema?: {
          autoMigration?: MigrationStyle;
        };
      },
    ): Database => {
      const dbName =
        createOptions.databaseName ??
        driver.getDatabaseNameOrDefault(createOptions.connectionString);

      const existing = dbClients.get(dbName);
      if (existing) return existing as Database;

      const newDb: Database = driver.databaseFactory({
        ...createOptions,
        schema: {
          ...createOptions.schema,
          ...(typedSchema?.dbs[dbName]
            ? { definition: typedSchema?.dbs[dbName] }
            : {}),
        },
      });
      dbClients.set(dbName, newDb);
      return newDb as unknown as Database;
    },

    all: (): Database[] => Array.from(dbClients.values()) as Database[],

    forAll: (func: (db: Database) => Promise<void>): Promise<void[]> => {
      return Promise.all(
        Array.from(dbClients.values())
          .map((v) => v as Database)
          .map(func),
      );
    },
  };
};
