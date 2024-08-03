export * from './core';
export * from './pg';
import {
  type NodePostgresConnector,
  type NodePostgresPoolOptions,
  nodePostgresPool,
} from './pg';

export type PostgresConnector = NodePostgresConnector;
export type PostgresPoolOptions = NodePostgresPoolOptions;
export const postgresPool = nodePostgresPool;
