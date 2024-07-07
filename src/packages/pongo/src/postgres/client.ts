import { type DbClient } from '../main';
import { endPool, getPool } from './pool';
import { postgresCollection } from './postgresCollection';

export const postgresClient = (
  connectionString: string,
  database?: string,
): DbClient => {
  const pool = getPool({ connectionString, database });

  return {
    connect: () => Promise.resolve(),
    close: () => endPool(connectionString),
    collection: <T>(name: string) => postgresCollection<T>(name, pool),
  };
};
