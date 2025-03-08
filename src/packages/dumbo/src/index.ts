import {
  postgresPool,
  type PostgresConnector,
  type PostgresPool,
  type PostgresPoolOptions,
} from './storage/postgresql';

export * from './core';
export * from './storage/postgresql';

// TODO: Merge with ConnectorTypeName
export type ConnectorType = PostgresConnector;

export type PoolOptions = {
  connector?: ConnectorType;
};

export type DumboOptions = PoolOptions & PostgresPoolOptions;
export type Dumbo = PostgresPool;

export const connectionPool = <PoolOptionsType extends DumboOptions>(
  options: PoolOptionsType,
) =>
  // TODO: this should have the pattern matching and verification
  postgresPool(options as unknown as PostgresPoolOptions);

export const dumbo = <DumboOptionsType extends DumboOptions = DumboOptions>(
  options: DumboOptionsType,
): Dumbo => connectionPool(options);
