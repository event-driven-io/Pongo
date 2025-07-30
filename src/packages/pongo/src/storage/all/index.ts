import type { DatabaseConnectionString } from '@event-driven-io/dumbo';
import { NodePostgresConnectorType } from '@event-driven-io/dumbo/pg';
import type { PongoClientOptions } from '../../core';
import type { PostgresDbClientOptions } from '../postgresql';

export const clientToDbOptions = <
  ConnectionString extends DatabaseConnectionString,
  DbClientOptions extends PostgresDbClientOptions = PostgresDbClientOptions,
>(options: {
  connectionString: ConnectionString;
  dbName?: string;
  clientOptions: PongoClientOptions;
}): DbClientOptions => {
  const postgreSQLOptions: PostgresDbClientOptions = {
    connector: NodePostgresConnectorType,
    connectionString: options.connectionString,
    dbName: options.dbName,
    ...options.clientOptions,
  };

  return postgreSQLOptions as DbClientOptions;
};
