import {
  postgresPool,
  type PostgresConnector,
  type PostgresPool,
  type PostgresPoolOptions,
} from './postgres';

export * from './core';
export * from './postgres';

export type ConnectorType = PostgresConnector;

export type PoolOptions = {
  connector?: ConnectorType;
};

export type DumboOptions = PoolOptions;
export type Dumbo = PostgresPool;

export const connectionPool = <PoolOptionsType extends PoolOptions>(
  options: PoolOptionsType,
) =>
  // TODO: this should have the pattern matching and verification
  postgresPool(options as unknown as PostgresPoolOptions);

export const dumbo = <DumboOptionsType extends DumboOptions = DumboOptions>(
  options: DumboOptionsType,
): Dumbo => connectionPool(options);
