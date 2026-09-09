import {
  pgDumboDriver as dumboDriver,
  isPgClient,
  isPgNativePool,
  PgDriverType,
  type PgConnection,
  type PgPool,
  type PgPoolOptions,
  type PgTransactionOptions,
} from '@event-driven-io/dumbo/pg';
import type { JSONSerializer } from '@event-driven-io/dumbo';
import {
  PongoDatabase,
  PongoError,
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

type PgAmbientConnectionDriverOptions = PgDriverBaseOptions & {
  databaseName?: string | undefined;
  connectionString?: string | undefined;
  connectionOptions: Extract<PgConnectionOptions, { connection: PgConnection }>;
  pool?: PgPool | undefined;
};

export type PgDatabaseDriverOptions =
  | PgConnectionStringDriverOptions
  | PgPoolDriverOptions
  | PgAmbientConnectionDriverOptions;

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
      throw new PongoError(
        `The ambient PostgreSQL connection is connected to database ${ambientDatabase} and cannot be used for ${databaseName}`,
      );
    }

    return PongoDatabase({
      ...options,
      transactionOptions: connectionOptions.transactionOptions,
      pool: options.pool ?? createPgPool(options),
      sqlBuilderFor: (collection) =>
        postgresSQLBuilder(collection, options.serializer),
      databaseName,
      defaultSchemaName,
    });
  },
};

const createPgPool = (
  options: PgDatabaseDriverOptions & {
    databaseName: string;
    serializer: JSONSerializer;
  },
): PgPool => {
  const { connectionOptions, connectionString } = options;
  const transactionOptions = withPongoTransactionOptions<
    PgConnectionOptions,
    PgTransactionOptions
  >(connectionOptions).transactionOptions;
  const txOpts = transactionOptions ? { transactionOptions } : {};
  const serialization = { serializer: options.serializer };

  if (connectionOptions && 'connection' in connectionOptions)
    return dumboDriver.createPool({
      ...connectionOptions,
      ...txOpts,
      serialization,
    });

  if (connectionString === undefined)
    throw new PongoError('PostgreSQL connection string or pool is required');

  return dumboDriver.createPool({
    ...(connectionOptions as Exclude<
      PgConnectionOptions,
      { connection: PgConnection }
    >),
    connectionString,
    database: options.databaseName,
    ...txOpts,
    serialization,
  });
};

export const usePgPongoDriver = () => {
  pongoDriverRegistry.register(PgDriverType, pgPongoDriver);
};

usePgPongoDriver();

export { pgPongoDriver as pgDriver, pgPongoDriver as pongoDriver };
