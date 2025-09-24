import type { Dumbo } from '../../../core';
import {
  type StoragePlugin,
  storagePluginRegistry,
} from '../../../core/plugins/storagePlugin';
import { DefaultPostgreSQLMigratorOptions, pgFormatter } from '../core';
import {
  type NodePostgresConnection,
  NodePostgresDriverType,
  type NodePostgresPool,
  nodePostgresPool,
  type NodePostgresPoolOptions,
} from './connections';

export const pgStoragePlugin: StoragePlugin<
  NodePostgresDriverType,
  NodePostgresConnection
> = {
  driverType: NodePostgresDriverType,
  createPool: (options) =>
    nodePostgresPool(options as unknown as PostgresPoolOptions),
  sqlFormatter: pgFormatter,
  defaultMigratorOptions: DefaultPostgreSQLMigratorOptions,
};

storagePluginRegistry.register(NodePostgresDriverType, pgStoragePlugin);

export const dumbo = <
  DumboOptionsType extends PostgresPoolOptions = PostgresPoolOptions,
>(
  options: DumboOptionsType,
): Dumbo<NodePostgresDriverType> => nodePostgresPool(options);

export * from './connections';
export * from './execute';
export * from './serialization';

export { pgStoragePlugin as storagePlugin };

// TODO: Remove stuff below

export type PostgresDriverType = NodePostgresDriverType;
export type PostgresPool = NodePostgresPool;
export type PostgresConnection = NodePostgresConnection;

export type PostgresPoolOptions = NodePostgresPoolOptions;
export const postgresPool = nodePostgresPool;

export const connectionPool = postgresPool;
