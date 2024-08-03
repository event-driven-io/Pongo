import {
  postgresPool,
  type PostgresConnector,
  type PostgresPoolOptions,
} from './postgres';

export * from './core';
export * from './postgres';

export type ConnectorType = PostgresConnector;
export type PoolOptions = PostgresPoolOptions;

export const connectionPool = (_type: ConnectorType, options: PoolOptions) =>
  postgresPool(options);
