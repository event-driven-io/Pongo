import {
  pgDumboDriver as dumboDriver,
  isPgClient,
  isPgNativePool,
  PgDriverType,
  type PgPool,
  type PgPoolOptions,
  type PgTransactionOptions,
} from '@event-driven-io/dumbo/pg';
import {
  PongoDatabase,
  pongoDriverRegistry,
  type DistributiveOmit,
  type PongoDb,
  type PongoDriver,
  type PongoDriverOptions,
  withPongoTransactionOptions,
} from '../../../core';
import { postgresSQLBuilder } from '../core';

type PgConnectionOptions = DistributiveOmit<
  PgPoolOptions,
  'connectionString' | 'database' | 'serialization'
>;

type PgDriverBaseOptions = Omit<
  PongoDriverOptions<typeof dumboDriver>,
  'connectionOptions' | 'pool'
> & {
  connectionOptions?: PgConnectionOptions | undefined;
};

type PgConnectionStringDriverOptions = PgDriverBaseOptions & {
  databaseName?: string | undefined;
  connectionString: string;
  pool?: PgPool | undefined;
};

type PgPoolDriverOptions = Omit<
  PongoDriverOptions<typeof dumboDriver>,
  'connectionOptions'
> & {
  databaseName?: string | undefined;
  connectionString?: string | undefined;
  pool: PgPool;
  connectionOptions?: undefined;
};

export type PgDatabaseDriverOptions =
  PgConnectionStringDriverOptions | PgPoolDriverOptions;

const pgPongoDriver: PongoDriver<
  PongoDb<PgDriverType>,
  typeof dumboDriver,
  PgDatabaseDriverOptions
> = {
  driverType: PgDriverType,
  dumboDriver,
  databaseFactory: (options) => {
    const { databaseName, defaultSchemaName } = options;
    const connectionOptions = withPongoTransactionOptions<
      PgConnectionOptions,
      PgTransactionOptions
    >(options.connectionOptions);

    const ambientClient =
      options.connectionOptions && 'client' in options.connectionOptions
        ? options.connectionOptions.client
        : undefined;
    const ambientPool =
      options.connectionOptions && 'pool' in options.connectionOptions
        ? options.connectionOptions.pool
        : undefined;
    const ambientDatabase = isPgNativePool(ambientPool)
      ? ambientPool.options.database
      : isPgClient(ambientClient)
        ? ambientClient.database
        : undefined;

    if (ambientDatabase && ambientDatabase !== databaseName) {
      throw new Error(
        `The ambient PostgreSQL connection is connected to database ${ambientDatabase} and cannot be used for ${databaseName}`,
      );
    }

    const { connectionString } = options;

    if (connectionString !== undefined) {
      return PongoDatabase({
        ...options,
        transactionOptions: connectionOptions.transactionOptions,
        pool:
          options.pool ??
          dumboDriver.createPool({
            connectionString,
            database: databaseName,
            ...connectionOptions,
            serialization: { serializer: options.serializer },
          }),
        sqlBuilderFor: (collection) =>
          postgresSQLBuilder(collection, options.serializer),
        databaseName,
        defaultSchemaName,
      });
    }

    const pool = options.pool;
    if (pool === undefined) {
      throw new Error('PostgreSQL connection string or pool is required');
    }

    return PongoDatabase({
      ...options,
      transactionOptions: connectionOptions.transactionOptions,
      pool,
      sqlBuilderFor: (collection) =>
        postgresSQLBuilder(collection, options.serializer),
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
