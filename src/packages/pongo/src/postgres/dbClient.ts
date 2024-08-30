import {
  dumbo,
  getDatabaseNameOrDefault,
  NodePostgresConnectorType,
  schemaComponentGroup,
  type PostgresConnector,
  type PostgresPoolOptions,
  type SchemaComponentGroup,
} from '@event-driven-io/dumbo';
import {
  objectEntries,
  pongoCollection,
  type PongoCollection,
  type PongoDb,
  type PongoDbClientOptions,
  type PongoDocument,
} from '../core';
import { proxyPongoDbWithSchema } from '../core/typing/schema';
import { postgresSQLBuilder } from './sqlBuilder';

export type PostgresDbClientOptions = PongoDbClientOptions<PostgresConnector>;

export const isPostgresClientOptions = (
  options: PongoDbClientOptions,
): options is PostgresDbClientOptions =>
  options.connectorType === NodePostgresConnectorType;

export const postgresDb = (
  options: PostgresDbClientOptions,
): PongoDb<PostgresConnector> => {
  const { connectionString, dbName } = options;
  const databaseName = dbName ?? getDatabaseNameOrDefault(connectionString);

  const collections = new Map<string, PongoCollection<PongoDocument>>();

  const pool = dumbo<PostgresPoolOptions>({
    connectionString,
    ...options.connectionOptions,
  });

  const db: PongoDb<PostgresConnector> = {
    connectorType: options.connectorType,
    databaseName,
    connect: () => Promise.resolve(),
    close: () => pool.close(),
    collection: <T extends PongoDocument>(
      collectionName: string,
    ): PongoCollection<T> => {
      return (collections.get(collectionName) ??
        collections
          .set(
            collectionName,
            pongoCollection({
              collectionName,
              db,
              sqlExecutor: pool.execute,
              sqlBuilder: postgresSQLBuilder(collectionName),
              ...(options.schema ? options.schema : {}),
            }),
          )
          .get(collectionName)!) as PongoCollection<T>;
    },
    transaction: () => pool.transaction(),
    withTransaction: (handle) => pool.withTransaction(handle),
    get schema() {
      return pongoDbSchemaComponentGroup(collections);
    },
  };

  const dbsSchema = options?.schema?.definition?.dbs;

  if (dbsSchema) {
    const dbSchema = objectEntries(dbsSchema)
      .map((e) => e[1])
      .find((db) => db.name === dbName || db.name === databaseName);

    if (dbSchema) return proxyPongoDbWithSchema(db, dbSchema);
  }

  return db;
};

const pongoDbSchemaComponentGroup = (
  collectionsMap: Map<string, PongoCollection<PongoDocument>>,
): SchemaComponentGroup =>
  schemaComponentGroup(
    'PongoDb',
    [...collectionsMap.values()].map((collection) => collection.schema),
  );
