import { dumbo } from '@event-driven-io/dumbo';
import {
  pgDumboDriver as dumboDriver,
  PgDriverType,
  type PgConnection,
  type PgTransactionOptions,
} from '@event-driven-io/dumbo/pg';
import type pg from 'pg';
import {
  PongoDatabase,
  pongoDriverRegistry,
  type PongoDb,
  type PongoDriver,
  type PongoDriverOptions,
  withPongoTransactionOptions,
} from '../../../core';
import { pongoPostgreSQLMigrationBuilder, postgresSQLBuilder } from '../core';

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
  dumboDriver,
  databaseFactory: (options) => {
    const { databaseName, defaultSchemaName } = options;
    if (databaseName === undefined || defaultSchemaName === undefined) {
      throw new Error(
        'PostgreSQL driver requires resolved database and default schema names',
      );
    }
    const connectionOptions = withPongoTransactionOptions<
      PgPongoClientOptions,
      PgTransactionOptions
    >(options.connectionOptions);
    const ambientOptions = options.connectionOptions;
    const ambientDatabase =
      ambientOptions && 'pool' in ambientOptions && ambientOptions.pool
        ? ambientOptions.pool.options.database
        : ambientOptions && 'client' in ambientOptions && ambientOptions.client
          ? ambientOptions.client.database
          : undefined;

    if (ambientDatabase && ambientDatabase !== databaseName) {
      throw new Error(
        `The ambient PostgreSQL connection is connected to database ${ambientDatabase} and cannot be used for ${databaseName}`,
      );
    }

    return PongoDatabase({
      ...options,
      transactionOptions: connectionOptions.transactionOptions,
      pool: dumbo({
        connectionString: options.connectionString,
        driver: dumboDriver,
        database: databaseName,
        ...connectionOptions,
        serialization: { serializer: options.serializer },
      }),
      migrationBuilder: pongoPostgreSQLMigrationBuilder,
      sqlBuilderFor: (collection, identifier) =>
        postgresSQLBuilder(collection, identifier, options.serializer),
      databaseName,
      defaultSchemaName,
    });
  },
};

export const usePgPongoDriver = () => {
  pongoDriverRegistry.register(PgDriverType, pgPongoDriver);
};

usePgPongoDriver();

export { pgPongoDriver as pgDriver, pgPongoDriver as pongoDriver };
