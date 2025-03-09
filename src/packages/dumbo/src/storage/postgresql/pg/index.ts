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

export const connectionPool = postgresPool;

export const dumbo = <
  DumboOptionsType extends PostgresPoolOptions = PostgresPoolOptions,
>(
  options: DumboOptionsType,
): Dumbo<NodePostgresConnector> => connectionPool(options);

export * from './connections';
export * from './execute';
export * from './serialization';
