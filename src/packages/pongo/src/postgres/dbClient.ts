import {
  getDatabaseNameOrDefault,
  postgresPool,
  type PostgresPoolOptions,
} from '@event-driven-io/dumbo';
import { type DbClient, type PongoDbClientOptions } from '../core';
import { pongoCollection } from './postgresCollection';

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
    collection: (name) =>
      pongoCollection(name, {
        dbName: databaseName,
        sqlExecutor: pool.execute,
      }),
  };
};
