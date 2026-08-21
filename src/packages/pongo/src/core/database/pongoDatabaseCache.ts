import type {
  DatabaseMetadata,
  DatabaseDriverType,
  JSONSerializationOptions,
  MigrationStyle,
} from '@event-driven-io/dumbo';
import type {
  DistributiveOmit,
  PongoDatabaseFactoryOptions,
  PongoDriver,
} from '../drivers';
import { PongoError } from '../errors';
import type { PongoClientSchema, PongoDbSchema } from '../schema';
import type { PongoDb } from '../typing';

export const resolvePongoDatabaseNames = ({
  metadata,
  databaseName,
  declaredDatabaseName,
  defaultSchemaName,
  connectionString,
}: {
  metadata: DatabaseMetadata;
  databaseName?: string | undefined;
  declaredDatabaseName?: string | undefined;
  defaultSchemaName?: string | undefined;
  connectionString?: string | undefined;
}): { databaseName: string; defaultSchemaName?: string | undefined } => ({
  databaseName:
    databaseName ??
    declaredDatabaseName ??
    metadata.parseDatabaseName?.(connectionString) ??
    metadata.defaultDatabaseName,
  defaultSchemaName,
});

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
      createOptions: DistributiveOmit<
        PongoDatabaseFactoryOptions,
        'databaseName' | 'defaultSchemaName' | 'schema'
      > & {
        databaseName?: string | undefined;
        defaultSchemaName?: string | undefined;
        hasExplicitDatabaseOptions?: boolean | undefined;
      } & JSONSerializationOptions & {
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
      const resolvedNames = resolvePongoDatabaseNames({
        metadata,
        databaseName:
          declaredDefinition?.databaseName ?? createOptions.databaseName,
        declaredDatabaseName: schemaDefinition?.databaseName,
        defaultSchemaName: createOptions.defaultSchemaName,
        connectionString:
          'connectionString' in createOptions
            ? (createOptions.connectionString as string)
            : undefined,
      });
      const dbName = resolvedNames.databaseName;
      const defaultSchemaName = resolvedNames.defaultSchemaName;

      if (!metadata.capabilities.supportsMultipleDatabases) {
        if (fixedDatabaseName !== undefined && fixedDatabaseName !== dbName) {
          throw new PongoError(
            `The ${metadata.databaseType} driver is already bound to database ${fixedDatabaseName} and cannot switch to ${dbName}`,
          );
        }

        fixedDatabaseName = dbName;
      }

      const existing = dbClients.get(dbName);
      if (existing !== undefined) {
        if (createOptions.hasExplicitDatabaseOptions === true) {
          throw new PongoError(
            `Database "${dbName}" is already set up. Call db("${dbName}") without options to reuse it`,
          );
        }

        return existing;
      }

      const definition = declaredDefinition ?? getDatabaseDefinition(dbName);

      const schemaOptions: {
        autoMigration?: MigrationStyle;
        definition?: PongoDbSchema;
      } = { ...createOptions.schema };
      const schemaDefinitionForDatabase = definition ?? schemaDefinition;

      if (schemaDefinitionForDatabase !== undefined) {
        schemaOptions.definition = schemaDefinitionForDatabase;
      }

      const { hasExplicitDatabaseOptions: _, ...databaseFactoryOptions } =
        createOptions;
      const newDb: Database = driver.databaseFactory({
        ...databaseFactoryOptions,
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
