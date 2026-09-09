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
  cloudflareDurableObjectSQLiteTransactionFactory,
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
  const connection =
    sqliteAmbientClientConnection<CloudflareDurableObjectSQLiteConnection>({
      driverType: CloudflareDurableObjectSQLiteDriverType,
      client:
        'client' in options && options.client
          ? options.client
          : cloudflareDurableObjectSQLiteClient(options),
      transactionFactory: cloudflareDurableObjectSQLiteTransactionFactory(
        options.serializer,
        options.transactionOptions,
      ),
      serializer: options.serializer,
      errorMapper: mapSqliteError,
    });

  return connection;
};

export * from './cloudflareDurableObjectSQLiteClient';
