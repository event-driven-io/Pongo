import { dumbo } from '@event-driven-io/dumbo';
import {
  pgDatabaseDriver as dumboDriver,
  getDatabaseNameOrDefault,
  NodePostgresDriverType,
  type NodePostgresConnection,
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
  PongoDatabaseDriverOptions<NodePostgresPongoClientOptions> & {
    databaseName?: string | undefined;
    connectionString: string;
  };

const pgDatabaseDriver: PongoDatabaseDriver<
  PongoDb<NodePostgresDriverType>,
  NodePostgresDatabaseDriverOptions
> = {
  driverType: NodePostgresDriverType,
  databaseFactory: (options) => {
    const databaseName =
      options.databaseName ??
      getDatabaseNameOrDefault(options.connectionString);

    return PongoDatabase({
      ...options,
      pool: dumbo({
        connectionString: options.connectionString,
        driver: dumboDriver,
        ...options.connectionOptions,
      }),
      schemaComponent: PongoDatabaseSchemaComponent({
        driverType: NodePostgresDriverType,
        collectionFactory: (schema) =>
          PongoCollectionSchemaComponent({
            driverType: NodePostgresDriverType,
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
  getDatabaseNameOrDefault: (options) => {
    return (
      options.databaseName ?? getDatabaseNameOrDefault(options.connectionString)
    );
  },
  defaultConnectionString: 'postgresql://localhost:5432/postgres',
};

export const usePgDatabaseDriver = () => {
  pongoDatabaseDriverRegistry.register(
    NodePostgresDriverType,
    pgDatabaseDriver,
  );
};

usePgDatabaseDriver();

export { pgDatabaseDriver as databaseDriver, pgDatabaseDriver as pgDriver };
