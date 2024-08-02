import { postgresPool, type NodePostgresPoolOptions } from './postgres';

export * from './core';
export * from './postgres';

export type PoolOptions = NodePostgresPoolOptions;
export const connectionPool = (_type: 'PostgreSQL', options: PoolOptions) =>
  postgresPool(options);
