import type {
  DatabaseDriverType,
  JSONSerializationOptions,
  MigrationStyle,
} from '@event-driven-io/dumbo';
import type { PongoDatabaseFactoryOptions, PongoDriver } from '../drivers';
import type { PongoClientSchema, PongoDbSchema } from '../schema';
import type { PongoDb } from '../typing';

export const PONGO_DEFAULT_DATABASE_NAME = 'db:default';
export const PONGO_DEFAULT_SCHEMA_NAME = 'schema:default';

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
  schemaDefinition?: PongoDbSchema | undefined;
}) => {
  const dbClients = new Map<string, Database>();
  let fixedDatabaseName: string | undefined;

  const getDatabaseDefinition = (dbName: string | undefined) => {
    if (dbName === undefined) return undefined;

    return Object.entries(typedSchema?.dbs ?? {}).find(
      ([key, definition]) =>
        key === dbName || definition.databaseName === dbName,
    )?.[1];
  };

  return {
    getOrCreate: (
      createOptions: Omit<PongoDatabaseFactoryOptions, 'schema'> &
        JSONSerializationOptions & {
          schema?: {
            autoMigration?: MigrationStyle;
            definition?: PongoDbSchema;
          };
        },
    ): Database => {
      const metadata = driver.dumboDriver.databaseMetadata;
      const declaredDefinition = getDatabaseDefinition(
        createOptions.databaseName,
      );
      const dbName =
        createOptions.databaseName ??
        declaredDefinition?.databaseName ??
        schemaDefinition?.databaseName ??
        metadata?.parseDatabaseName?.(
          'connectionString' in createOptions
            ? (createOptions.connectionString as string)
            : undefined,
        ) ??
        metadata.defaultDatabaseName ??
        PONGO_DEFAULT_DATABASE_NAME;
      const defaultSchemaName =
        createOptions.defaultSchemaName ??
        metadata.defaultSchemaName ??
        PONGO_DEFAULT_SCHEMA_NAME;

      if (!metadata.capabilities.supportsMultipleDatabases) {
        if (fixedDatabaseName !== undefined && fixedDatabaseName !== dbName) {
          throw new Error(
            `The ${metadata.databaseType} driver is already bound to database ${fixedDatabaseName} and cannot switch to ${dbName}`,
          );
        }

        fixedDatabaseName = dbName;
      }

      const existing = dbClients.get(dbName);
      if (existing) return existing;

      const definition = declaredDefinition ?? getDatabaseDefinition(dbName);

      const schemaOptions: {
        autoMigration?: MigrationStyle;
        definition?: PongoDbSchema;
      } = { ...createOptions.schema };
      const schemaDefinitionForDatabase = definition ?? schemaDefinition;

      if (schemaDefinitionForDatabase !== undefined) {
        schemaOptions.definition = schemaDefinitionForDatabase;
      }

      const newDb: Database = driver.databaseFactory({
        ...createOptions,
        databaseName: dbName,
        defaultSchemaName,
        schema: schemaOptions,
      });
      dbClients.set(dbName, newDb);
      return newDb;
    },

    all: (): Database[] => [...dbClients.values()],

    forAll: (func: (db: Database) => Promise<void>): Promise<void[]> => {
      return Promise.all([...dbClients.values()].map(func));
    },
  };
};
