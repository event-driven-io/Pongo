import type { DurableObjectStorage } from '@cloudflare/workers-types';
import {
  createSingletonConnectionPool,
  InvalidOperationError,
  JSONSerializer,
  type ConnectionOptions,
  type ConnectionPool,
  type JSONSerializationOptions,
} from '../../../../core';
import {
  cloudflareDurableObjectSQLiteConnection,
  CloudflareDurableObjectSQLiteDriverType,
  type CloudflareDurableObjectSQLiteClient,
  type CloudflareDurableObjectSQLiteConnection,
} from '../connections';

type CloudflareDurableObjectSQLitePoolSource =
  | {
      storage: DurableObjectStorage;
      client?: never;
      connection?: never;
    }
  | {
      storage?: never;
      client: CloudflareDurableObjectSQLiteClient;
      connection?: never;
    }
  | {
      storage?: never;
      client?: never;
      connection: CloudflareDurableObjectSQLiteConnection;
    };

export type CloudflareDurableObjectSQLitePoolOptions =
  ConnectionOptions<CloudflareDurableObjectSQLiteConnection> &
    CloudflareDurableObjectSQLitePoolSource &
    JSONSerializationOptions;

export type CloudflareDurableObjectSQLiteConnectionPool =
  ConnectionPool<CloudflareDurableObjectSQLiteConnection>;

export const cloudflareDurableObjectSQLitePool = (
  options: CloudflareDurableObjectSQLitePoolOptions,
): CloudflareDurableObjectSQLiteConnectionPool =>
  createSingletonConnectionPool<CloudflareDurableObjectSQLiteConnection>({
    driverType: CloudflareDurableObjectSQLiteDriverType,
    getConnection: () => {
      const serializer = JSONSerializer.from(options);
      const sourceCount = [
        options.storage,
        options.client,
        options.connection,
      ].filter((source) => source !== undefined).length;

      if (sourceCount !== 1) {
        throw new InvalidOperationError(
          'Exactly one Cloudflare Durable Object SQLite storage, client, or connection is required',
        );
      }

      if (options.connection) {
        return options.connection;
      }

      const connectionOptions = {
        serializer,
        ...(options.transactionOptions
          ? { transactionOptions: options.transactionOptions }
          : {}),
      };

      if (options.client) {
        return cloudflareDurableObjectSQLiteConnection({
          ...connectionOptions,
          client: options.client,
        });
      }

      if (options.storage) {
        return cloudflareDurableObjectSQLiteConnection({
          ...connectionOptions,
          storage: options.storage,
        });
      }

      throw new InvalidOperationError(
        'Exactly one Cloudflare Durable Object SQLite storage, client, or connection is required',
      );
    },
  });
