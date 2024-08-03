import {
  isPostgresClientOptions,
  postgresDbClient,
  type PostgresDbClientOptions,
} from '../postgres';
import type { PongoCollection, PongoDocument } from './typing';

export type PongoDbClientOptions<
  DbType extends string = string,
  Additional = unknown,
> = {
  type: DbType;
  connectionString: string;
  dbName: string | undefined;
} & Additional;

export interface DbClient<
  DbClientOptions extends PongoDbClientOptions = PongoDbClientOptions,
> {
  databaseName: string;
  options: DbClientOptions;
  connect(): Promise<void>;
  close(): Promise<void>;
  collection: <T extends PongoDocument>(name: string) => PongoCollection<T>;
}

export type AllowedDbClientOptions = PostgresDbClientOptions;

export const getDbClient = <
  DbClientOptions extends AllowedDbClientOptions = AllowedDbClientOptions,
>(
  options: DbClientOptions,
): DbClient<DbClientOptions> => {
  const { type } = options;
  // This is the place where in the future could come resolution of other database types
  if (!isPostgresClientOptions(options))
    throw new Error(`Unsupported db type: ${type}`);

  return postgresDbClient(options) as DbClient<DbClientOptions>;
};
