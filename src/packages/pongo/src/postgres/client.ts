import {
  endPool,
  getDatabaseNameOrDefault,
  getPool,
} from '@event-driven-io/dumbo';
import pg from 'pg';
import {
  type DbClient,
  type PongoDbClientOptions,
  type PongoDocument,
} from '../main';
import { postgresCollection } from './postgresCollection';

export type PostgresDbClientOptions = PongoDbClientOptions<
  'PostgreSQL',
  {
    client?: pg.PoolClient | pg.Client | undefined;
  }
>;

export const isPostgresClientOptions = (
  options: PongoDbClientOptions,
): options is PostgresDbClientOptions => options.type === 'PostgreSQL';

export const postgresDbClient = (
  options: PostgresDbClientOptions,
): DbClient<PostgresDbClientOptions> => {
  const { connectionString, dbName, client } = options;
  const managesPoolLifetime = !client;
  const poolOrClient =
    client ?? getPool({ connectionString, database: dbName });

  return {
    options,
    connect: () => Promise.resolve(),
    close: () =>
      managesPoolLifetime
        ? endPool({ connectionString, database: dbName })
        : Promise.resolve(),
    collection: <T extends PongoDocument>(name: string) =>
      postgresCollection<T>(name, {
        dbName: dbName ?? getDatabaseNameOrDefault(connectionString),
        poolOrClient,
      }),
  };
};
