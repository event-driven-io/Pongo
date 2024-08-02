export * from './core';
export * from './pg';
import { type NodePostgresPoolOptions, nodePostgresPool } from './pg';

export type PostgresPoolOptions = NodePostgresPoolOptions;
export const postgresPool = nodePostgresPool;
