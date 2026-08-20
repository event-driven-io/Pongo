import { dumbo, type DumboConnectionOptions } from '@event-driven-io/dumbo';
import {
  pgDumboDriver as dumboDriver,
  isPgClient,
  isPgNativePool,
  PgDriverType,
  type PgTransactionOptions,
} from '@event-driven-io/dumbo/pg';
import {
  PongoDatabase,
  pongoDriverRegistry,
  type PongoDb,
  type PongoDriver,
  type PongoDriverOptions,
  withPongoTransactionOptions,
} from '../../../core';
import { postgresSQLBuilder } from '../core';

export type PgDatabaseDriverOptions = PongoDriverOptions<typeof dumboDriver> & {
  databaseName?: string | undefined;
  connectionString: string;
};

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
      DumboConnectionOptions<typeof dumboDriver>,
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

    return PongoDatabase({
      ...options,
      transactionOptions: connectionOptions.transactionOptions,
      pool: options.pool
        ? options.pool
        : dumbo({
            connectionString: options.connectionString,
            driver: dumboDriver,
            database: databaseName,
            ...connectionOptions,
            serialization: { serializer: options.serializer },
          }),
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
