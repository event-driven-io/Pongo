import { JSONSerializer } from '@event-driven-io/dumbo';
import type {
  D1PoolOptions,
  D1TransactionOptions,
} from '@event-driven-io/dumbo/cloudflare';
import { D1DriverType, d1Pool } from '@event-driven-io/dumbo/cloudflare';
import {
  PongoCollectionSchemaComponent,
  PongoDatabase,
  pongoDriverRegistry,
  pongoDatabaseSchemaComponentFor,
  type PongoDb,
  type PongoDriver,
  type PongoDriverOptions,
  withPongoTransactionOptions,
} from '../../../core';
import { pongoCollectionSQLiteMigrations, sqliteSQLBuilder } from '../core';

export type SQLitePongoClientOptions = object;

type D1DatabaseDriverOptions = PongoDriverOptions<Partial<D1PoolOptions>> &
  Partial<D1PoolOptions>;

const d1PongoDriver: PongoDriver<
  PongoDb<D1DriverType>,
  D1DatabaseDriverOptions
> = {
  driverType: D1DriverType,
  databaseFactory: (options) => {
    const databaseName = options.databaseName ?? 'db:default';
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
      schemaComponent: pongoDatabaseSchemaComponentFor({
        driverType: D1DriverType,
        databaseName,
        collectionFactory: (schema) =>
          PongoCollectionSchemaComponent({
            driverType: D1DriverType,
            definition: schema,
            migrations: pongoCollectionSQLiteMigrations(schema),
            sqlBuilder: sqliteSQLBuilder(
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

export const useD1PongoDriver = () => {
  pongoDriverRegistry.register(D1DriverType, d1PongoDriver);
};

useD1PongoDriver();

export { d1PongoDriver as d1Driver, d1PongoDriver as pongoDriver };
