import {
  getDatabaseMetadata,
  type DatabaseDriverType,
  type JSONSerializationOptions,
  type MigrationStyle,
  type AnySchemaComponent,
} from '@event-driven-io/dumbo';
import type { PongoDatabaseFactoryOptions, PongoDriver } from '../drivers';
import type {
  PongoClientSchema,
  PongoCollectionSchema,
  PongoDbSchema,
} from '../schema';
import type { PongoDb } from '../typing';

export const PongoDatabaseCache = <
  Database extends PongoDb<DatabaseDriverType> = PongoDb<DatabaseDriverType>,
  TypedClientSchema extends PongoClientSchema = PongoClientSchema,
>({
  driver,
  typedSchema,
  schemaDefinition,
}: {
  driver: PongoDriver<Database>;
  typedSchema?: TypedClientSchema | undefined;
  schemaDefinition?: PongoDbSchema | AnySchemaComponent | undefined;
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
      > &
        JSONSerializationOptions & {
          schema?: {
            autoMigration?: MigrationStyle;
            definition?: PongoDbSchema<CollectionsSchema> | AnySchemaComponent;
          };
        },
    ): Database => {
      const metadata = getDatabaseMetadata(driver.driverType);
      const dbName =
        createOptions.databaseName ??
        metadata?.parseDatabaseName?.(
          'connectionString' in createOptions
            ? (createOptions.connectionString as string)
            : undefined,
        ) ??
        'db:default';

      const existing = dbClients.get(dbName);
      if (existing) return existing as Database;

      const definition = getDatabaseDefinition(createOptions.databaseName);

      const schemaOptions: {
        autoMigration?: MigrationStyle;
        definition?: PongoDbSchema<CollectionsSchema> | AnySchemaComponent;
      } = { ...createOptions.schema };
      const schemaDefinitionForDatabase =
        (definition as PongoDbSchema<CollectionsSchema> | undefined) ??
        schemaDefinition;

      if (schemaDefinitionForDatabase !== undefined) {
        schemaOptions.definition = schemaDefinitionForDatabase as
          PongoDbSchema<CollectionsSchema> | AnySchemaComponent;
      }

      const newDb: Database = driver.databaseFactory({
        ...createOptions,
        databaseName: dbName,
        schema: schemaOptions,
      });
      dbClients.set(dbName, newDb);
      return newDb;
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
