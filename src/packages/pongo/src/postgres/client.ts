import { endPool, getPool } from '@event-driven-io/dumbo';
import { type DbClient } from '../main';
import { postgresCollection } from './postgresCollection';

export const postgresClient = (
  connectionString: string,
  database?: string,
): DbClient => {
  const pool = getPool({ connectionString, database });

  return {
    connect: () => Promise.resolve(),
    close: () => endPool({ connectionString, database }),
    collection: <T>(name: string) => postgresCollection<T>(name, pool),
  };
};
