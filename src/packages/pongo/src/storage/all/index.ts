import type {
  ConnectorType,
  DatabaseConnectionString,
  InferConnectorDatabaseType,
} from '@event-driven-io/dumbo';
import { NodePostgresConnectorType } from '@event-driven-io/dumbo/pg';
import type { PongoClientOptions, PongoDbClientOptions } from '../../core';

export const clientToDbOptions = <
  ConnectionString extends DatabaseConnectionString<
    InferConnectorDatabaseType<Connector>
  >,
  Connector extends ConnectorType = ConnectorType,
  DbClientOptions extends
    PongoDbClientOptions<ConnectionString> = PongoDbClientOptions<ConnectionString>,
>(options: {
  connectionString: ConnectionString;
  dbName?: string;
  clientOptions: PongoClientOptions<ConnectionString>;
}): DbClientOptions => {
  const postgreSQLOptions: PongoDbClientOptions<ConnectionString> = {
    connector: NodePostgresConnectorType,
    dbName: options.dbName,
    ...options.clientOptions,
  };

  return postgreSQLOptions as DbClientOptions;
};
