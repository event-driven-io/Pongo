import type { D1Database } from '@cloudflare/workers-types';
import type { MigratorOptions } from '@event-driven-io/dumbo';
import type {
  D1ConnectionPool,
  D1TransactionOptions,
} from '@event-driven-io/dumbo/cloudflare';
import {
  D1DriverType,
  d1Pool,
  d1DumboDriver as dumboDriver,
} from '@event-driven-io/dumbo/cloudflare';
import {
  PongoDatabase,
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

const d1MigrationOptions = (pool: D1ConnectionPool): MigratorOptions => ({
  execute: pool.execute,
});

const d1PongoDriver: PongoDriver<
  PongoDb<D1DriverType, false>,
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
      const pool = options.pool ?? d1Pool(pongoConnectionOptions);

      return PongoDatabase({
        ...options,
        transactionOptions: pongoConnectionOptions.transactionOptions,
        pool,
        migrationOptions: d1MigrationOptions(pool),
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

    const { database: _database, ...driverOptions } = options;
    const pongoConnectionOptions = withPongoTransactionOptions({
      ...driverOptions,
      ...options.connectionOptions,
      ...(database ? { database } : {}),
    });
    const pool = options.pool ?? d1Pool(pongoConnectionOptions);

    return PongoDatabase({
      ...options,
      transactionOptions: pongoConnectionOptions.transactionOptions,
      pool,
      migrationOptions: d1MigrationOptions(pool),
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
