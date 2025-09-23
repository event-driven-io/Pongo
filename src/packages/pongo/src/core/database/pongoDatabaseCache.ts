import type { ConnectorType, MigrationStyle } from '@event-driven-io/dumbo';
import type {
  PongoDatabaseDriver,
  PongoDatabaseFactoryOptions,
} from '../drivers';
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

  const getDatabaseDefinition = (dbName: string | undefined) =>
    Object.values(typedSchema?.dbs ?? {}).find((d) => d.name === dbName);

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

      const definition = getDatabaseDefinition(createOptions.databaseName);

      const newDb: Database = driver.databaseFactory({
        ...createOptions,
        databaseName: dbName,
        schema: {
          ...createOptions.schema,
          ...(definition ? { definition } : {}),
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
