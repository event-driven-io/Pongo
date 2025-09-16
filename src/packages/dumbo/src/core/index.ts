import type { DatabaseConnectionString } from '../storage/all';
import { type Connection, type ConnectionPool } from './connections';
import type { ConnectorType, InferConnectorDatabaseType } from './connectors';

export * from './connections';
export * from './connectors';
export * from './execute';
export * from './locks';
export * from './plugins';
export * from './query';
export * from './schema';
export * from './serializer';
export * from './sql';
export * from './tracing';

export type Dumbo<
  Connector extends ConnectorType = ConnectorType,
  ConnectionType extends Connection<Connector> = Connection<Connector>,
> = ConnectionPool<ConnectionType>;

export type DumboConnectionOptions<
  Connector extends ConnectorType = ConnectorType,
  ConnectionString extends DatabaseConnectionString<
    InferConnectorDatabaseType<ConnectorType>
  > = DatabaseConnectionString<InferConnectorDatabaseType<ConnectorType>>,
> = {
  connectionString: string | ConnectionString;
  connector: Connector;
};
