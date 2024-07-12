import { postgresClient, type PongoClientOptions } from '../postgres';
import type { PongoCollection, PongoDocument } from './typing/operations';

export interface DbClient {
  connect(): Promise<void>;
  close(): Promise<void>;
  collection: <T extends PongoDocument>(name: string) => PongoCollection<T>;
}

export const getDbClient = (options: PongoClientOptions): DbClient => {
  // This is the place where in the future could come resolution of other database types
  return postgresClient(options);
};
