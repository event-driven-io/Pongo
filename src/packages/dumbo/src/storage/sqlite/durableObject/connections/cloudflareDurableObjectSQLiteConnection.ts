import type { DurableObjectStorage } from '@cloudflare/workers-types';
import type {
  Connection,
  ConnectionOptions,
  JSONSerializer,
} from '../../../../core';
import {
  sqliteAmbientClientConnection,
  type SQLiteDriverType,
} from '../../core';
import { mapSqliteError } from '../../core/errors';
import {
  cloudflareDurableObjectSQLiteTransaction,
  type CloudflareDurableObjectSQLiteTransaction,
} from '../transactions';
import {
  cloudflareDurableObjectSQLiteClient,
  type CloudflareDurableObjectSQLiteClient,
} from './cloudflareDurableObjectSQLiteClient';

export type CloudflareDurableObjectSQLiteDriverType =
  SQLiteDriverType<'cloudflareDurableObjectSQLite'>;

export const CloudflareDurableObjectSQLiteDriverType: CloudflareDurableObjectSQLiteDriverType =
  'SQLite:cloudflareDurableObjectSQLite';

export type CloudflareDurableObjectSQLiteConnection = Connection<
  CloudflareDurableObjectSQLiteConnection,
  CloudflareDurableObjectSQLiteDriverType,
  CloudflareDurableObjectSQLiteClient,
  CloudflareDurableObjectSQLiteTransaction
>;

type CloudflareDurableObjectSQLiteConnectionSource =
  | {
      client: CloudflareDurableObjectSQLiteClient;
      storage?: never;
    }
  | {
      client?: never;
      storage: DurableObjectStorage;
    };

export type CloudflareDurableObjectSQLiteConnectionOptions =
  ConnectionOptions<CloudflareDurableObjectSQLiteConnection> &
    CloudflareDurableObjectSQLiteConnectionSource & {
      serializer: JSONSerializer;
    };

export const cloudflareDurableObjectSQLiteConnection = (
  options: CloudflareDurableObjectSQLiteConnectionOptions,
): CloudflareDurableObjectSQLiteConnection => {
  const initTransaction = cloudflareDurableObjectSQLiteTransaction(
    () => connection,
    options.serializer,
    options.transactionOptions,
  );

  const connection =
    sqliteAmbientClientConnection<CloudflareDurableObjectSQLiteConnection>({
      driverType: CloudflareDurableObjectSQLiteDriverType,
      client:
        'client' in options && options.client
          ? options.client
          : cloudflareDurableObjectSQLiteClient(options),
      initTransaction: () => initTransaction,
      serializer: options.serializer,
      errorMapper: mapSqliteError,
    });

  connection.transaction = (transactionOptions) =>
    initTransaction(connection.open(), {
      ...transactionOptions,
      close: () => Promise.resolve(),
    });
  connection.withTransaction = (handle, transactionOptions) =>
    connection
      .transaction(transactionOptions)
      .withTransaction(handle, transactionOptions);

  return connection;
};

export * from './cloudflareDurableObjectSQLiteClient';
