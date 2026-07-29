import type {
  D1PoolOptions,
  D1TransactionOptions,
} from '@event-driven-io/dumbo/cloudflare';
import {
  D1DriverType,
  d1DumboDriver as dumboDriver,
  d1Pool,
} from '@event-driven-io/dumbo/cloudflare';
import { sqliteTableReference } from '@event-driven-io/dumbo/sqlite';
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
      sqlBuilderFor: (collection, identifier) => {
        const referenceFor = (tableName: string) =>
          sqliteTableReference({ ...identifier, tableName });
        return sqliteSQLBuilder(
          collection,
          referenceFor(identifier.tableName),
          referenceFor,
          options.serializer,
        );
      },
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
