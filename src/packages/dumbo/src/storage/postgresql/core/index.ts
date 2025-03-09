import type { ConnectorType } from '../../../core';

export * from './connections';
export * from './locks';
export * from './schema';

export type PostgreSQLConnector = 'PostgreSQL';
export const PostgreSQLConnector = 'PostgreSQL';

export type PostgreSQLConnectorType<DriverName extends string = string> =
  ConnectorType<PostgreSQLConnector, DriverName>;
