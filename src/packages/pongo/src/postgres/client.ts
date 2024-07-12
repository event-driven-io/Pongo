import { endPool, getPool } from '@event-driven-io/dumbo';
import pg from 'pg';
import { type DbClient } from '../main';
import { postgresCollection } from './postgresCollection';

export type PongoClientOptions = {
  connectionString: string;
  database?: string | undefined;
  client?: pg.PoolClient;
};

export const postgresClient = (options: PongoClientOptions): DbClient => {
  const { connectionString, database, client } = options;
  const managesPoolLifetime = !client;
  const clientOrPool = client ?? getPool({ connectionString, database });

  return {
    connect: () => Promise.resolve(),
    close: () =>
      managesPoolLifetime
        ? endPool({ connectionString, database })
        : Promise.resolve(),
    collection: <T>(name: string) => postgresCollection<T>(name, clientOrPool),
  };
};
