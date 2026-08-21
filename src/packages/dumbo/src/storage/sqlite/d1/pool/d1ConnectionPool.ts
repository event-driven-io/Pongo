import type { D1Database } from '@cloudflare/workers-types';
import {
  createSingletonConnectionPool,
  InvalidOperationError,
  JSONSerializer,
  type ConnectionPool,
  type JSONSerializationOptions,
} from '../../../../core';
import {
  d1Connection,
  D1DriverType,
  type D1Connection,
} from '../connections/d1Connection';
import type { D1Client, D1ConnectionOptions } from '../connections';

export type D1PoolOptions = Omit<
  D1ConnectionOptions,
  'database' | 'serializer' | 'connection'
> & {
  database?: D1Database;
  client?: D1Client;
  connection?: D1Connection;
} & JSONSerializationOptions;

export type D1ConnectionPool = ConnectionPool<D1Connection>;

export const d1Pool = (options: D1PoolOptions): D1ConnectionPool =>
  createSingletonConnectionPool<D1Connection>({
    driverType: D1DriverType,
    getConnection: () => {
      const serializer = JSONSerializer.from(options);
      if (options.connection) {
        const { client: _client, ...ambientOptions } = options;
        return d1Connection({
          ...ambientOptions,
          connection: options.connection,
          serializer,
        });
      }

      if (!options.database) {
        throw new InvalidOperationError(
          'D1 database or connection is required',
        );
      }

      const { connection: _connection, ...clientOptions } = options;
      return d1Connection({
        ...clientOptions,
        database: options.database,
        serializer,
      });
    },
  });
