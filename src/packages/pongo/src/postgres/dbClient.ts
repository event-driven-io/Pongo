import {
  dumbo,
  getDatabaseNameOrDefault,
  NodePostgresConnectorType,
  type PostgresConnector,
  type PostgresPoolOptions,
} from '@event-driven-io/dumbo';
import {
  pongoCollection,
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

  const db: PongoDb<PostgresConnector> = {
    connectorType: options.connectorType,
    databaseName,
    connect: () => Promise.resolve(),
    close: () => pool.close(),
    collection: (collectionName) =>
      pongoCollection({
        collectionName,
        db,
        sqlExecutor: pool.execute,
        sqlBuilder: postgresSQLBuilder(collectionName),
        ...(options.schema ? options.schema : {}),
      }),
    transaction: () => pool.transaction(),
    withTransaction: (handle) => pool.withTransaction(handle),
  };

  return db;
};
