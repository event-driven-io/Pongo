import type { DurableObjectStorage } from '@cloudflare/workers-types';
import {
  cloudflareDurableObjectSQLiteDumboDriver as dumboDriver,
  CloudflareDurableObjectSQLiteDriverType,
  cloudflareDurableObjectSQLitePool,
  type CloudflareDurableObjectSQLiteConnection,
  type CloudflareDurableObjectSQLiteConnectionPool,
  type CloudflareDurableObjectSQLiteTransactionOptions,
} from '@event-driven-io/dumbo/cloudflare';
import {
  PongoDatabase,
  PongoError,
  pongoDriverRegistry,
  type PongoDb,
  type PongoDriver,
  type PongoDriverOptions,
  withPongoTransactionOptions,
} from '../../../core';
import { sqliteSQLBuilder } from '../core';

type DurableObjectSQLiteConnectionOptions = {
  transactionOptions?: CloudflareDurableObjectSQLiteTransactionOptions;
} & (
  | {
      storage: DurableObjectStorage;
      connection?: never;
    }
  | {
      storage?: never;
      connection: CloudflareDurableObjectSQLiteConnection;
    }
);

type DurableObjectSQLiteDriverBaseOptions = Omit<
  PongoDriverOptions<typeof dumboDriver>,
  'connectionOptions' | 'pool'
> & {
  transactionOptions?:
    CloudflareDurableObjectSQLiteTransactionOptions | undefined;
};

type DurableObjectSQLiteDriverSource =
  | {
      storage: DurableObjectStorage;
      connectionOptions?: never;
      pool?: never;
    }
  | {
      storage?: never;
      connectionOptions: DurableObjectSQLiteConnectionOptions;
      pool?: never;
    }
  | {
      storage?: never;
      connectionOptions?: never;
      pool: CloudflareDurableObjectSQLiteConnectionPool;
    };

export type CloudflareDurableObjectSQLiteDatabaseDriverOptions =
  DurableObjectSQLiteDriverBaseOptions & DurableObjectSQLiteDriverSource;

const cloudflareDurableObjectSQLitePongoDriver: PongoDriver<
  PongoDb<CloudflareDurableObjectSQLiteDriverType>,
  typeof dumboDriver,
  CloudflareDurableObjectSQLiteDatabaseDriverOptions
> = {
  driverType: CloudflareDurableObjectSQLiteDriverType,
  dumboDriver,
  databaseFactory: (options) => {
    const { databaseName, defaultSchemaName } = options;
    const connectionOptions = options.connectionOptions;
    const connectionStorage =
      connectionOptions && 'storage' in connectionOptions
        ? connectionOptions.storage
        : undefined;
    const connection =
      connectionOptions && 'connection' in connectionOptions
        ? connectionOptions.connection
        : undefined;
    const sourceCount = [
      options.storage,
      connectionStorage,
      connection,
      options.pool,
    ].filter((source) => source !== undefined).length;

    if (sourceCount !== 1) {
      throw new PongoError(
        'Exactly one Durable Object SQLite storage, connection, or pool is required',
      );
    }

    const configuredTransactionOptions =
      connectionOptions?.transactionOptions ?? options.transactionOptions;
    const { transactionOptions } = withPongoTransactionOptions<
      object,
      CloudflareDurableObjectSQLiteTransactionOptions
    >({ transactionOptions: configuredTransactionOptions });

    let pool: CloudflareDurableObjectSQLiteConnectionPool;

    if (options.pool) {
      pool = options.pool;
    } else {
      const storage = options.storage ?? connectionStorage;

      if (storage) {
        pool = cloudflareDurableObjectSQLitePool({
          storage,
          transactionOptions,
          serialization: { serializer: options.serializer },
        });
      } else if (connection) {
        pool = cloudflareDurableObjectSQLitePool({
          connection,
          transactionOptions,
          serialization: { serializer: options.serializer },
        });
      } else {
        throw new PongoError(
          'Exactly one Durable Object SQLite storage, connection, or pool is required',
        );
      }
    }

    return PongoDatabase({
      ...options,
      transactionOptions,
      pool,
      sqlBuilderFor: (collection) =>
        sqliteSQLBuilder(collection, options.serializer),
      databaseName,
      defaultSchemaName,
    });
  },
};

export const useCloudflareDurableObjectSQLitePongoDriver = () => {
  pongoDriverRegistry.register(
    CloudflareDurableObjectSQLiteDriverType,
    cloudflareDurableObjectSQLitePongoDriver,
  );
};

useCloudflareDurableObjectSQLitePongoDriver();

export {
  cloudflareDurableObjectSQLitePongoDriver as cloudflareDurableObjectSQLiteDriver,
  cloudflareDurableObjectSQLitePongoDriver as pongoDriver,
};
