import { dumbo, JSONSerializer } from '@event-driven-io/dumbo';
import {
  pgDumboDriver as dumboDriver,
  PgDriverType,
  postgreSQLMetadata,
  type PgConnection,
} from '@event-driven-io/dumbo/pg';
import type pg from 'pg';
import {
  PongoCollectionSchemaComponent,
  PongoDatabase,
  PongoDatabaseSchemaComponent,
  pongoDriverRegistry,
  pongoSchema,
  type PongoDb,
  type PongoDriver,
  type PongoDriverOptions,
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

type PgDatabaseDriverOptions = PongoDriverOptions<PgPongoClientOptions> & {
  databaseName?: string | undefined;
  connectionString: string;
};

const pgPongoDriver: PongoDriver<
  PongoDb<PgDriverType>,
  PgDatabaseDriverOptions
> = {
  driverType: PgDriverType,
  databaseFactory: (options) => {
    const databaseName =
      options.databaseName ??
      postgreSQLMetadata.parseDatabaseName(options.connectionString) ??
      postgreSQLMetadata.defaultDatabaseName;

    return PongoDatabase({
      ...options,
      pool: dumbo({
        connectionString: options.connectionString,
        driver: dumboDriver,
        ...options.connectionOptions,
        serialization: { serializer: options.serializer },
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
};

export const usePgPongoDriver = () => {
  pongoDriverRegistry.register(PgDriverType, pgPongoDriver);
};

usePgPongoDriver();

export { pgPongoDriver as pgDriver, pgPongoDriver as pongoDriver };
