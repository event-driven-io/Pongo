import type {
  ConnectorType,
  DatabaseConnectionString,
} from '@event-driven-io/dumbo';
import {
  isPostgresClientOptions,
  postgresDb,
  type PostgresDbClientOptions,
} from '../storage/postgresql';
import type { PongoClientOptions } from './pongoClient';
import type { PongoDb } from './typing';

export type PongoDbClientOptions<
  ConnectionString extends DatabaseConnectionString,
  Connector extends ConnectorType = ConnectorType,
> = {
  connector: Connector;
  dbName: string | undefined;
} & PongoClientOptions<ConnectionString>;

export const getPongoDb = <
  ConnectionString extends DatabaseConnectionString,
  DbClientOptions extends
    PostgresDbClientOptions<ConnectionString> = PostgresDbClientOptions<ConnectionString>,
>(
  options: DbClientOptions,
): PongoDb => {
  const { connector } = options;
  // This is the place where in the future could come resolution of other database types
  if (!isPostgresClientOptions(options))
    throw new Error(`Unsupported db type: ${connector}`);

  return postgresDb(options);
};
