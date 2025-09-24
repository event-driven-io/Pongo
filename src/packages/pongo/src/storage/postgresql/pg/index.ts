import {
  dumbo,
  getDatabaseNameOrDefault,
  NodePostgresConnectorType,
  type NodePostgresConnection,
  type NodePostgresConnector,
} from '@event-driven-io/dumbo/pg';
import pg from 'pg';
import {
  PongoCollectionSchemaComponent,
  PongoDatabase,
  pongoDatabaseDriverRegistry,
  PongoDatabaseSchemaComponent,
  pongoSchema,
  type PongoDatabaseDriver,
  type PongoDatabaseDriverOptions,
  type PongoDb,
} from '../../../core';
import {
  pongoCollectionPostgreSQLMigrations,
  postgresSQLBuilder,
} from '../core';

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
    const databaseName =
      options.databaseName ??
      getDatabaseNameOrDefault(options.connectionString);

    return PongoDatabase({
      ...options,
      pool: dumbo({
        connectionString: options.connectionString,
        ...options.connectionOptions,
      }),
      schemaComponent: PongoDatabaseSchemaComponent({
        connector: NodePostgresConnectorType,
        collectionFactory: (schema) =>
          PongoCollectionSchemaComponent({
            connector: NodePostgresConnectorType,
            definition: schema,
            migrationsOrSchemaComponents: {
              migrations: pongoCollectionPostgreSQLMigrations(schema.name),
            },
            sqlBuilder: postgresSQLBuilder(schema.name),
          }),
        definition:
          options.schema?.definition ?? pongoSchema.db(databaseName, {}),
      }),
      databaseName,
    });
  },
  getDatabaseNameOrDefault,
  defaultConnectionString: 'postgresql://localhost:5432/postgres',
};

pongoDatabaseDriverRegistry.register(
  NodePostgresConnectorType,
  pgDatabaseDriver,
);

export { pgDatabaseDriver as databaseDriver, pgDatabaseDriver as pgDriver };
