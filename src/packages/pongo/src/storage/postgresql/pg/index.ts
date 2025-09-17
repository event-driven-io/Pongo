import {
  dumbo,
  getDatabaseNameOrDefault,
  NodePostgresConnectorType,
  type NodePostgresConnection,
  type NodePostgresConnector,
} from '@event-driven-io/dumbo/pg';
import pg from 'pg';
import { PongoDatabase, type PongoDb } from '../../../core';
import {
  pongoDatabaseDriverRegistry,
  type PongoDatabaseDriver,
  type PongoDatabaseDriverOptions,
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

type NodePostgresDatabaseDriverOptions =
  PongoDatabaseDriverOptions<NodePostgresPongoClientOptions>;

const pgDatabaseDriver: PongoDatabaseDriver<
  PongoDb<NodePostgresConnector>,
  NodePostgresDatabaseDriverOptions
> = {
  connector: NodePostgresConnectorType,
  databaseFactory: (options) => {
    return PongoDatabase({
      ...options,
      pool: dumbo(options),
      dbSchemaComponent: undefined!,
      databaseName:
        options.databaseName ??
        getDatabaseNameOrDefault(options.connectionString),
    });
  },
  getDatabaseNameOrDefault,
};

pongoDatabaseDriverRegistry.register(
  NodePostgresConnectorType,
  pgDatabaseDriver,
);

export { pgDatabaseDriver as databaseDriver };
