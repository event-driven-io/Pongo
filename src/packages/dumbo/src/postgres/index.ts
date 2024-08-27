export * from './core';
export * from './migrations';
export * from './pg';
import {
  type NodePostgresConnection,
  type NodePostgresConnector,
  type NodePostgresPool,
  type NodePostgresPoolOptions,
  nodePostgresPool,
} from './pg';

export type PostgresConnector = NodePostgresConnector;
export type PostgresPoolOptions = NodePostgresPoolOptions;
export type PostgresPool = NodePostgresPool;
export type PostgresConnection = NodePostgresConnection;
export const postgresPool = nodePostgresPool;
