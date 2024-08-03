import {
  getDatabaseNameOrDefault,
  NodePostgresConnectorType,
  postgresPool,
  type PostgresConnector,
  type PostgresPoolOptions,
} from '@event-driven-io/dumbo';
import {
  pongoCollection,
  type PongoDb,
  type PongoDbClientOptions,
} from '../core';
import { postgresSQLBuilder } from './sqlBuilder';

export type PostgresDbClientOptions = PongoDbClientOptions<PostgresConnector> &
  PostgresPoolOptions;

export const isPostgresClientOptions = (
  options: PongoDbClientOptions,
): options is PostgresDbClientOptions =>
  options.connectorType === NodePostgresConnectorType;

export const postgresDb = (
  options: PostgresDbClientOptions,
): PongoDb<PostgresConnector> => {
  const { connectionString, dbName } = options;
  const databaseName = dbName ?? getDatabaseNameOrDefault(connectionString);

  const pool = postgresPool(options);

  return {
    connectorType: options.connectorType,
    databaseName,
    pool,
    connect: () => Promise.resolve(),
    close: () => pool.close(),
    collection: (collectionName) =>
      pongoCollection({
        collectionName,
        dbName: databaseName,
        sqlExecutor: pool.execute,
        sqlBuilder: postgresSQLBuilder(collectionName),
      }),
    transaction: () => pool.transaction(),
    withTransaction: (handle) => pool.withTransaction(handle),
  };
};
