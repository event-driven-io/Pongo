import pg from 'pg';
import {
  createConnection,
  JSONSerializer,
  type Connection,
} from '../../../../core';
import type { PostgreSQLDriverType } from '../../core';
import { pgSQLExecutor } from '../execute';
import { pgTransaction } from './transaction';

export type PgDriverType = PostgreSQLDriverType<'pg'>;
export const PgDriverType: PgDriverType = 'PostgreSQL:pg';

export type PgPoolClient = pg.PoolClient;
export type PgClient = pg.Client;

export type PgClientOrPoolClient = PgPoolClient | PgClient;

export type PgPoolOrClient = pg.Pool | PgPoolClient | PgClient;

export type PgClientConnection = Connection<
  PgClientConnection,
  PgDriverType,
  PgClient
>;

export type PgPoolClientConnection = Connection<
  PgPoolClientConnection,
  PgDriverType,
  PgPoolClient
>;

export type PgConnection = PgPoolClientConnection | PgClientConnection;

export type PgPoolClientOptions = {
  type: 'PoolClient';
  connect: () => Promise<PgPoolClient>;
  close: (client: PgPoolClient) => Promise<void>;
};

export type PgClientOptions = {
  type: 'Client';
  connect: () => Promise<PgClient>;
  close: (client: PgClient) => Promise<void>;
};

export type PgClientConnectionOptions = PgClientOptions & {
  serializer: JSONSerializer;
};

export type PgPoolClientConnectionOptions = PgPoolClientOptions & {
  serializer: JSONSerializer;
};

export const pgClientConnection = (
  options: PgClientConnectionOptions,
): PgClientConnection => {
  const { connect, close } = options;

  return createConnection({
    driverType: PgDriverType,
    connect,
    close,
    initTransaction: (connection) =>
      pgTransaction(connection, options.serializer),
    executor: pgSQLExecutor,
    serializer: options.serializer,
  });
};

export const pgPoolClientConnection = (
  options: PgPoolClientConnectionOptions,
): PgPoolClientConnection => {
  const { connect, close } = options;

  return createConnection({
    driverType: PgDriverType,
    connect,
    close,
    initTransaction: (connection) =>
      pgTransaction(connection, options.serializer),
    executor: pgSQLExecutor,
    serializer: options.serializer,
  });
};

export type PgConnectionOptions =
  | PgPoolClientConnectionOptions
  | PgClientConnectionOptions;

export function pgConnection(
  options: PgPoolClientConnectionOptions,
): PgPoolClientConnection;
export function pgConnection(
  options: PgClientConnectionOptions,
): PgClientConnection;
export function pgConnection(
  options: PgPoolClientConnectionOptions | PgClientConnectionOptions,
): PgPoolClientConnection | PgClientConnection {
  return options.type === 'Client'
    ? pgClientConnection(options)
    : pgPoolClientConnection(options);
}

export type ConnectionCheckResult =
  | { successful: true }
  | {
      successful: false;
      code: string | undefined;
      errorType: 'ConnectionRefused' | 'Authentication' | 'Unknown';
      error: unknown;
    };

export const checkConnection = async (
  connectionString: string,
): Promise<ConnectionCheckResult> => {
  const client = new pg.Client({
    connectionString,
  });

  try {
    await client.connect();
    return { successful: true };
  } catch (error) {
    const code =
      error instanceof Error &&
      'code' in error &&
      typeof error.code === 'string'
        ? error.code
        : undefined;

    return {
      successful: false,
      errorType:
        code === 'ECONNREFUSED'
          ? 'ConnectionRefused'
          : code === '28P01'
            ? 'Authentication'
            : 'Unknown',
      code,
      error,
    };
  } finally {
    // Ensure the client is closed properly if connected
    await client.end();
  }
};
