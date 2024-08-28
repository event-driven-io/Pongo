import {
  isPostgresClientOptions,
  postgresDb,
  type PostgresDbClientOptions,
} from '../postgres';
import type { PongoClientOptions } from './pongoClient';
import type { PongoDb } from './typing';

export type PongoDbClientOptions<ConnectorType extends string = string> = {
  connectorType: ConnectorType;
  connectionString: string;
  dbName: string | undefined;
} & PongoClientOptions;

export type AllowedDbClientOptions = PostgresDbClientOptions;

export const getPongoDb = <
  DbClientOptions extends AllowedDbClientOptions = AllowedDbClientOptions,
>(
  options: DbClientOptions,
): PongoDb => {
  const { connectorType: type } = options;
  // This is the place where in the future could come resolution of other database types
  if (!isPostgresClientOptions(options))
    throw new Error(`Unsupported db type: ${type}`);

  return postgresDb(options);
};
