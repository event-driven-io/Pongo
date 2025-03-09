import type { Dumbo, DumboOptions } from '../../../core';
import {
  type NodePostgresConnection,
  type NodePostgresConnector,
  type NodePostgresPool,
  nodePostgresPool,
  type NodePostgresPoolOptions,
} from './connections';

export type PostgresConnector = NodePostgresConnector;
export type PostgresPool = NodePostgresPool;
export type PostgresConnection = NodePostgresConnection;

export type PostgresPoolOptions = DumboOptions<NodePostgresConnector> &
  NodePostgresPoolOptions;
export const postgresPool = nodePostgresPool;

export const connectionPool = <PoolOptionsType extends DumboOptions>(
  options: PoolOptionsType,
) =>
  // TODO: this should have the pattern matching and verification
  postgresPool(options as unknown as PostgresPoolOptions);

export const dumbo = <
  DumboOptionsType extends PostgresPoolOptions = PostgresPoolOptions,
>(
  options: DumboOptionsType,
): Dumbo<NodePostgresConnector> => connectionPool(options);

export * from './connections';
export * from './execute';
export * from './serialization';
