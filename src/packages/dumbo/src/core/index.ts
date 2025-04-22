import type { DatabaseConnectionString } from '../storage/all';
import { type Connection, type ConnectionPool } from './connections';
import type { ConnectorType } from './connectors';

export * from './connections';
export * from './connectors';
export * from './execute';
export * from './locks';
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
  T extends DatabaseConnectionString = DatabaseConnectionString,
> = {
  connectionString: string | T;
};
