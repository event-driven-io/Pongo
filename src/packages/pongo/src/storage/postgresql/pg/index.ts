import {
  NodePostgresConnectorType,
  pgStoragePlugin,
  type NodePostgresConnection,
  type NodePostgresConnector,
} from '@event-driven-io/dumbo/pg';
import pg from 'pg';
import {
  pongoStoragePluginRegistry,
  type PongoStoragePlugin,
} from '../../../core/plugins';

export type NodePostgresPongoClientOptions =
  | PooledPongoClientOptions
  | NotPooledPongoOptions;

export type PooledPongoClientOptions =
  | {
      pool: pg.Pool;
    }
  | {
      pooled: true;
    }
  | {
      pool: pg.Pool;
      pooled: true;
    }
  | object;

export type NotPooledPongoOptions =
  | {
      client: pg.Client;
    }
  | {
      pooled: false;
    }
  | {
      client: pg.Client;
      pooled: false;
    }
  | {
      connection: NodePostgresConnection;
      pooled?: false;
    };

const pgPongoStoragePlugin: PongoStoragePlugin<
  NodePostgresConnector,
  NodePostgresConnection
> = {
  connector: NodePostgresConnectorType,
  dumboPlugin: pgStoragePlugin,
};

pongoStoragePluginRegistry.register(
  NodePostgresConnectorType,
  pgPongoStoragePlugin,
);
