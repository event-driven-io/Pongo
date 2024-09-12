import {
  dumbo,
  getDatabaseNameOrDefault,
  NodePostgresConnectorType,
  runPostgreSQLMigrations,
  schemaComponent,
  type PostgresConnector,
  type PostgresPoolOptions,
  type SchemaComponent,
} from '@event-driven-io/dumbo';
import type { Document } from 'mongodb';
import {
  objectEntries,
  pongoCollection,
  pongoCollectionSchemaComponent,
  proxyPongoDbWithSchema,
  type PongoCollection,
  type PongoDb,
  type PongoDbClientOptions,
} from '../core';
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

  const pool = dumbo<PostgresPoolOptions>({
    connectionString,
    ...options.connectionOptions,
  });

  const collections = new Map<string, PongoCollection<Document>>();

  const db: PongoDb<PostgresConnector> = {
    connectorType: options.connectorType,
    databaseName,
    connect: () => Promise.resolve(),
    close: () => pool.close(),
    collection: (collectionName) =>
      pongoCollection({
        collectionName,
        db,
        pool,
        sqlBuilder: postgresSQLBuilder(collectionName),
        ...(options.schema ? options.schema : {}),
      }),
    transaction: () => pool.transaction(),
    withTransaction: (handle) => pool.withTransaction(handle),

    schema: {
      get component(): SchemaComponent {
        return schemaComponent('pongoDb', {
          components: [...collections.values()].map((c) => c.schema.component),
        });
      },
      migrate: () =>
        runPostgreSQLMigrations(
          pool,
          [...collections.values()].flatMap((c) =>
            // TODO: This needs to change to support more connectors
            c.schema.component.migrations({ connector: 'PostgreSQL:pg' }),
          ),
        ),
    },
  };

  const dbsSchema = options?.schema?.definition?.dbs;

  if (dbsSchema) {
    const dbSchema = objectEntries(dbsSchema)
      .map((e) => e[1])
      .find((db) => db.name === dbName || db.name === databaseName);

    if (dbSchema) return proxyPongoDbWithSchema(db, dbSchema, collections);
  }

  return db;
};

export const pongoDbSchemaComponent = (
  collections: string[] | SchemaComponent[],
) => {
  const components =
    collections.length > 0 && typeof collections[0] === 'string'
      ? collections.map((collectionName) =>
          pongoCollectionSchemaComponent(collectionName as string),
        )
      : (collections as SchemaComponent[]);

  return schemaComponent('pongo:schema_component:db', {
    components,
  });
};
