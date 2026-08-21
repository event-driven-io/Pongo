import type { D1Database } from '@cloudflare/workers-types';
import type { D1TransactionOptions } from '@event-driven-io/dumbo/cloudflare';
import {
  D1DriverType,
  d1Pool,
  d1DumboDriver as dumboDriver,
} from '@event-driven-io/dumbo/cloudflare';
import {
  PongoDatabase,
  PongoError,
  pongoDriverRegistry,
  withPongoTransactionOptions,
  type PongoDb,
  type PongoDriver,
  type PongoDriverOptions,
} from '../../../core';
import { sqliteSQLBuilder } from '../core';

export type D1DatabaseDriverOptions = PongoDriverOptions<typeof dumboDriver> & {
  database?: D1Database | undefined;
  transactionOptions?: D1TransactionOptions | undefined;
};

const d1PongoDriver: PongoDriver<
  PongoDb<D1DriverType>,
  typeof dumboDriver,
  D1DatabaseDriverOptions
> = {
  driverType: D1DriverType,
  dumboDriver,
  databaseFactory: (options) => {
    const { databaseName, defaultSchemaName } = options;
    const ambientConnectionOptions =
      options.connectionOptions && 'connection' in options.connectionOptions
        ? options.connectionOptions
        : undefined;

    if (ambientConnectionOptions) {
      const pongoConnectionOptions = withPongoTransactionOptions(
        ambientConnectionOptions,
      );

      return PongoDatabase({
        ...options,
        transactionOptions: pongoConnectionOptions.transactionOptions,
        pool: options.pool ?? d1Pool(pongoConnectionOptions),
        sqlBuilderFor: (collection) =>
          sqliteSQLBuilder(collection, options.serializer),
        databaseName,
        defaultSchemaName,
      });
    }

    const database =
      options.database ??
      (options.connectionOptions && 'database' in options.connectionOptions
        ? options.connectionOptions.database
        : undefined);

    if (!database) {
      throw new PongoError('D1 database or connection is required');
    }

    const pongoConnectionOptions = withPongoTransactionOptions({
      ...options,
      ...options.connectionOptions,
      database,
    });

    return PongoDatabase({
      ...options,
      transactionOptions: pongoConnectionOptions.transactionOptions,
      pool: options.pool ?? d1Pool(pongoConnectionOptions),
      sqlBuilderFor: (collection) =>
        sqliteSQLBuilder(collection, options.serializer),
      databaseName,
      defaultSchemaName,
    });
  },
};

export const useD1PongoDriver = () => {
  pongoDriverRegistry.register(D1DriverType, d1PongoDriver);
};

useD1PongoDriver();

export { d1PongoDriver as d1Driver, d1PongoDriver as pongoDriver };
