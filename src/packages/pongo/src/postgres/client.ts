import {
  getDatabaseNameOrDefault,
  nodePostgresPool,
} from '@event-driven-io/dumbo';
import {
  type DbClient,
  type PongoDbClientOptions,
  type PongoDocument,
} from '../main';
import { postgresCollection } from './postgresCollection';

export type PostgresDbClientOptions = PongoDbClientOptions<'PostgreSQL'>;

export const isPostgresClientOptions = (
  options: PongoDbClientOptions,
): options is PostgresDbClientOptions => options.type === 'PostgreSQL';

export const postgresDbClient = (
  options: PostgresDbClientOptions,
): DbClient<PostgresDbClientOptions> => {
  const { connectionString, dbName } = options;

  const pool = nodePostgresPool(options);

  return {
    options,
    connect: () => Promise.resolve(),
    close: () => pool.close(),
    collection: <T extends PongoDocument>(name: string) =>
      postgresCollection<T>(name, {
        dbName: dbName ?? getDatabaseNameOrDefault(connectionString),
        pool,
      }),
  };
};
