import type { ConnectorType } from '@event-driven-io/dumbo';
import {
  isPostgresClientOptions,
  postgresDb,
  type PostgresDbClientOptions,
} from '../storage/postgresql';
import type { PongoClientOptions } from './pongoClient';
import type { PongoDb } from './typing';

export type PongoDbClientOptions<
  Connector extends ConnectorType = ConnectorType,
> = {
  connector: Connector;
  connectionString: string;
  dbName: string | undefined;
} & PongoClientOptions;

export const getPongoDb = <
  DbClientOptions extends PostgresDbClientOptions = PostgresDbClientOptions,
>(
  options: DbClientOptions,
): PongoDb => {
  const { connector } = options;
  // This is the place where in the future could come resolution of other database types
  if (!isPostgresClientOptions(options))
    throw new Error(`Unsupported db type: ${connector}`);

  return postgresDb(options);
};
