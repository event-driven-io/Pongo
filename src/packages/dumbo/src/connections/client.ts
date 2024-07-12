import pg from 'pg';
import { endPool, getPool } from './pool';

export interface PostgresClient {
  connect(): Promise<pg.PoolClient>;
  close(): Promise<void>;
}

export const postgresClient = (
  connectionString: string,
  database?: string,
): PostgresClient => {
  const pool = getPool({ connectionString, database });

  return {
    connect: () => pool.connect(),
    close: () => endPool({ connectionString, database }),
  };
};
