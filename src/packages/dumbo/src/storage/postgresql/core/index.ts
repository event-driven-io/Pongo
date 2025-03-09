import type { ConnectorTypeName } from '../../../core';

export * from '../../../core/locks';
export * from './connections';
export * from './schema';

export type PostgreSQLConnector = 'PostgreSQL';
export const PostgreSQLConnector = 'PostgreSQL';

export type PostgreSQLConnectorType<DriverName extends string = string> =
  ConnectorTypeName<PostgreSQLConnector, DriverName>;
