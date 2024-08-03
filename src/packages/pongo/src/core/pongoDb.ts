import {
  isPostgresClientOptions,
  postgresDb,
  type PostgresDbClientOptions,
} from '../postgres';
import type { PongoDb } from './typing';

export type PongoDbClientOptions<DbType extends string = string> = {
  connectionString: string;
  dbType: DbType;
  dbName: string | undefined;
};

export type AllowedDbClientOptions = PostgresDbClientOptions;

export const getPongoDb = <
  DbClientOptions extends AllowedDbClientOptions = AllowedDbClientOptions,
>(
  options: DbClientOptions,
): PongoDb => {
  const { dbType: type } = options;
  // This is the place where in the future could come resolution of other database types
  if (!isPostgresClientOptions(options))
    throw new Error(`Unsupported db type: ${type}`);

  return postgresDb(options);
};
