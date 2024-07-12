import {
  endPool,
  getDatabaseNameOrDefault,
  getPool,
} from '@event-driven-io/dumbo';
import pg from 'pg';
import { type DbClient, type PongoDocument } from '../main';
import { postgresCollection } from './postgresCollection';

export type PongoClientOptions = {
  connectionString: string;
  dbName?: string | undefined;
  client?: pg.PoolClient | undefined;
};

export const postgresClient = (options: PongoClientOptions): DbClient => {
  const { connectionString, dbName, client } = options;
  const managesPoolLifetime = !client;
  const poolOrClient =
    client ?? getPool({ connectionString, database: dbName });

  return {
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
