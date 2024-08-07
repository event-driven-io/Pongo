export * from './core';
export * from './pg';
import {
  type NodePostgresConnector,
  type NodePostgresPool,
  type NodePostgresPoolOptions,
  nodePostgresPool,
} from './pg';

export type PostgresConnector = NodePostgresConnector;
export type PostgresPoolOptions = NodePostgresPoolOptions;
export type PostgresPool = NodePostgresPool;
export const postgresPool = nodePostgresPool;
