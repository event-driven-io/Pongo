import { dumbo, JSONSerializer } from '@event-driven-io/dumbo';
import {
  pgDumboDriver as dumboDriver,
  PgDriverType,
  postgreSQLMetadata,
  type PgConnection,
  type PgTransactionOptions,
} from '@event-driven-io/dumbo/pg';
import type pg from 'pg';
import {
  PongoCollectionSchemaComponent,
  PongoDatabase,
  pongoDriverRegistry,
  pongoDatabaseSchemaFromPongoSchema,
  type PongoDb,
  type PongoDriver,
  type PongoDriverOptions,
  withPongoTransactionOptions,
} from '../../../core';
import {
  pongoCollectionPostgreSQLMigrations,
  postgresSQLBuilder,
} from '../core';

export type PgPongoClientOptions =
  PooledPongoClientOptions | NotPooledPongoOptions;

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
    const connectionOptions = withPongoTransactionOptions<
      PgPongoClientOptions,
      PgTransactionOptions
    >(options.connectionOptions);

    return PongoDatabase({
      ...options,
      transactionOptions: connectionOptions.transactionOptions,
      pool: dumbo({
        connectionString: options.connectionString,
        driver: dumboDriver,
        ...connectionOptions,
        serialization: { serializer: options.serializer },
      }),
      schemaComponent: pongoDatabaseSchemaFromPongoSchema({
        driverType: PgDriverType,
        databaseName,
        collectionFactory: (schema) =>
          PongoCollectionSchemaComponent({
            driverType: PgDriverType,
            definition: schema,
            migrations: pongoCollectionPostgreSQLMigrations(schema),
            sqlBuilder: postgresSQLBuilder(
              schema,
              options.serialization?.serializer ?? JSONSerializer,
            ),
          }),
        definition: options.schema?.definition,
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
