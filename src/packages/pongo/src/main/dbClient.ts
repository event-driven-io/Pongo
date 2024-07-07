import { postgresClient } from '../postgres';
import type { PongoCollection } from './typing/operations';

export interface DbClient {
  connect(): Promise<void>;
  close(): Promise<void>;
  collection: <T>(name: string) => PongoCollection<T>;
}

export const getDbClient = (
  connectionString: string,
  database?: string,
): DbClient => {
  // This is the place where in the future could come resolution of other database types
  return postgresClient(connectionString, database);
};
