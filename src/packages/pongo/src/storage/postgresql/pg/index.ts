import { dumbo, JSONSerializer } from '@event-driven-io/dumbo';
import {
  pgDatabaseDriver as dumboDriver,
  getDatabaseNameOrDefault,
  PgDriverType,
  type PgConnection,
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

export type PgPongoClientOptions =
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
      connection: PgConnection;
      pooled?: false;
    };

type PgDatabaseDriverOptions =
  PongoDatabaseDriverOptions<PgPongoClientOptions> & {
    databaseName?: string | undefined;
    connectionString: string;
  };

const pgDatabaseDriver: PongoDatabaseDriver<
  PongoDb<PgDriverType>,
  PgDatabaseDriverOptions
> = {
  driverType: PgDriverType,
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
        driverType: PgDriverType,
        collectionFactory: (schema) =>
          PongoCollectionSchemaComponent({
            driverType: PgDriverType,
            definition: schema,
            migrationsOrSchemaComponents: {
              migrations: pongoCollectionPostgreSQLMigrations(schema.name),
            },
            sqlBuilder: postgresSQLBuilder(
              schema.name,
              options.serialization?.serializer ?? JSONSerializer,
            ),
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
  pongoDatabaseDriverRegistry.register(PgDriverType, pgDatabaseDriver);
};

usePgDatabaseDriver();

export { pgDatabaseDriver as databaseDriver, pgDatabaseDriver as pgDriver };
