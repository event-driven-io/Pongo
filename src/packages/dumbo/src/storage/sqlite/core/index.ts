import type { ConnectorType } from '../../..';

export * from './connections';
export * from './execute';
export * from './pool';
export * from './transactions';

export type SQLiteConnector = 'SQLite';
export const SQLiteConnector = 'SQLite';

export type SQLiteConnectorType<DriverName extends string = string> =
  ConnectorType<SQLiteConnector, DriverName>;
