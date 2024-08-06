import {
  postgresPool,
  type PostgresConnector,
  type PostgresPoolOptions,
} from './postgres';

export * from './core';
export * from './postgres';

export type ConnectorType = PostgresConnector;
export type PoolOptions = {
  type?: ConnectorType;
  options: PostgresPoolOptions;
};
export type DumboOptions = PoolOptions;

export const connectionPool = ({ options }: PoolOptions) =>
  postgresPool(options);

export const dumbo = (options: DumboOptions) => connectionPool(options);
