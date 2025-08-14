import type { Dumbo } from '../../../core';
import {
  type StoragePlugin,
  storagePluginRegistry,
} from '../../../core/plugins/storagePlugin';
import { DefaultPostgreSQLMigratorOptions, pgFormatter } from '../core';
import {
  type NodePostgresConnection,
  type NodePostgresConnector,
  NodePostgresConnectorType,
  type NodePostgresPool,
  nodePostgresPool,
  type NodePostgresPoolOptions,
} from './connections';

const pgStoragePlugin: StoragePlugin<
  NodePostgresConnector,
  NodePostgresConnection
> = {
  connector: NodePostgresConnectorType,
  createPool: (options) =>
    nodePostgresPool(options as unknown as PostgresPoolOptions),
  sqlFormatter: pgFormatter,
  defaultMigratorOptions: DefaultPostgreSQLMigratorOptions,
};

storagePluginRegistry.register(NodePostgresConnectorType, pgStoragePlugin);

export const dumbo = <
  DumboOptionsType extends PostgresPoolOptions = PostgresPoolOptions,
>(
  options: DumboOptionsType,
): Dumbo<NodePostgresConnector> => nodePostgresPool(options);

export * from './connections';
export * from './execute';
export * from './serialization';

export { pgStoragePlugin as storagePlugin };

// TODO: Remove stuff below

export type PostgresConnector = NodePostgresConnector;
export type PostgresPool = NodePostgresPool;
export type PostgresConnection = NodePostgresConnection;

export type PostgresPoolOptions = NodePostgresPoolOptions;
export const postgresPool = nodePostgresPool;

export const connectionPool = postgresPool;
