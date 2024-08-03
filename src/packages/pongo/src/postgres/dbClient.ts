import {
  getDatabaseNameOrDefault,
  postgresPool,
  type PostgresPoolOptions,
} from '@event-driven-io/dumbo';
import {
  pongoCollection,
  type DbClient,
  type PongoDbClientOptions,
} from '../core';
import { postgresSQLBuilder } from './collectionSqlBuilder';

export type PostgresDbClientOptions = PongoDbClientOptions<'PostgreSQL'> &
  PostgresPoolOptions;

export const isPostgresClientOptions = (
  options: PongoDbClientOptions,
): options is PostgresDbClientOptions => options.type === 'PostgreSQL';

export const postgresDbClient = (
  options: PostgresDbClientOptions,
): DbClient<PostgresDbClientOptions> => {
  const { connectionString, dbName } = options;
  const databaseName = dbName ?? getDatabaseNameOrDefault(connectionString);

  const pool = postgresPool(options);

  return {
    databaseName,
    options,
    connect: () => Promise.resolve(),
    close: () => pool.close(),
    collection: (collectionName) =>
      pongoCollection({
        collectionName,
        dbName: databaseName,
        sqlExecutor: pool.execute,
        sqlBuilder: postgresSQLBuilder(collectionName),
      }),
  };
};
