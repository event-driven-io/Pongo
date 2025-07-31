import type { SupportedDatabaseConnectionString } from '@event-driven-io/dumbo';
import { NodePostgresConnectorType } from '@event-driven-io/dumbo/pg';
import type { PongoClientOptions } from '../../core';
import type { PostgresDbClientOptions } from '../postgresql';

export const clientToDbOptions = <
  ConnectionString extends SupportedDatabaseConnectionString,
  DbClientOptions extends
    PostgresDbClientOptions<ConnectionString> = PostgresDbClientOptions<ConnectionString>,
>(options: {
  connectionString: ConnectionString;
  dbName?: string;
  clientOptions: PongoClientOptions<ConnectionString>;
}): DbClientOptions => {
  const postgreSQLOptions: PostgresDbClientOptions<ConnectionString> = {
    connector: NodePostgresConnectorType,
    dbName: options.dbName,
    ...options.clientOptions,
  };

  return postgreSQLOptions as DbClientOptions;
};
