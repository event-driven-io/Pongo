import {
  getDatabaseNameOrDefault,
  postgresPool,
  type PostgresPoolOptions,
} from '@event-driven-io/dumbo';
import {
  pongoCollection,
  type PongoDb,
  type PongoDbClientOptions,
} from '../core';
import { postgresSQLBuilder } from './sqlBuilder';

export type PostgresDbClientOptions = PongoDbClientOptions<'PostgreSQL'> &
  PostgresPoolOptions;

export const isPostgresClientOptions = (
  options: PongoDbClientOptions,
): options is PostgresDbClientOptions => options.dbType === 'PostgreSQL';

export const postgresDb = (
  options: PostgresDbClientOptions,
): PongoDb<'PostgreSQL'> => {
  const { connectionString, dbName } = options;
  const databaseName = dbName ?? getDatabaseNameOrDefault(connectionString);

  const pool = postgresPool(options);

  return {
    databaseType: options.dbType,
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
  };
};
