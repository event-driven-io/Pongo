import type {
  D1PoolOptions,
  D1TransactionOptions,
} from '@event-driven-io/dumbo/cloudflare';
import {
  D1DriverType,
  d1DumboDriver as dumboDriver,
  d1Pool,
} from '@event-driven-io/dumbo/cloudflare';
import {
  PongoDatabase,
  pongoDriverRegistry,
  type PongoDb,
  type PongoDriver,
  type PongoDriverOptions,
  withPongoTransactionOptions,
} from '../../../core';
import { pongoSQLiteMigrationBuilder, sqliteSQLBuilder } from '../core';

export type SQLitePongoClientOptions = object;

type D1DatabaseDriverOptions = PongoDriverOptions<Partial<D1PoolOptions>> &
  Partial<D1PoolOptions>;

const d1PongoDriver: PongoDriver<
  PongoDb<D1DriverType>,
  D1DatabaseDriverOptions
> = {
  driverType: D1DriverType,
  dumboDriver,
  databaseFactory: (options) => {
    const { databaseName, defaultSchemaName } = options;
    if (databaseName === undefined || defaultSchemaName === undefined) {
      throw new Error(
        'D1 driver requires resolved database and default schema names',
      );
    }
    const connectionOptions = {
      ...options,
      ...options.connectionOptions,
    } as D1PoolOptions;
    const pongoConnectionOptions = withPongoTransactionOptions<
      D1PoolOptions,
      D1TransactionOptions
    >(connectionOptions);

    return PongoDatabase({
      ...options,
      transactionOptions: pongoConnectionOptions.transactionOptions,
      pool: d1Pool({
        ...pongoConnectionOptions,
      }),
      migrationBuilder: pongoSQLiteMigrationBuilder,
      sqlBuilderFor: (collection, identifier) =>
        sqliteSQLBuilder(collection, identifier, options.serializer),
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
