import pg from 'pg';
import { createConnection, type Connection } from '../../../core';
import { nodePostgresSQLExecutor } from '../execute';
import { nodePostgresTransaction } from './transaction';

export const NodePostgresConnectorType = 'PostgreSQL:pg';
export type NodePostgresConnector = 'PostgreSQL:pg';

export type NodePostgresClient = pg.PoolClient | pg.Client;

export type NodePostgresPoolOrClient = pg.Pool | pg.PoolClient | pg.Client;

export type NodePostgresClientConnection = Connection<
  NodePostgresConnector,
  pg.Client
>;

export type NodePostgresPoolClientConnection = Connection<
  NodePostgresConnector,
  pg.PoolClient
>;

export type NodePostgresConnection =
  | NodePostgresPoolClientConnection
  | NodePostgresClientConnection;

export type NodePostgresPoolClientOptions = {
  type: 'PoolClient';
  connect: Promise<pg.PoolClient>;
  close: (client: pg.PoolClient) => Promise<void>;
};

export type NodePostgresClientOptions = {
  type: 'Client';
  connect: Promise<pg.Client>;
  close: (client: pg.Client) => Promise<void>;
};

export const nodePostgresClientConnection = (
  options: NodePostgresClientOptions,
): NodePostgresClientConnection => {
  const { connect, close } = options;

  return createConnection({
    type: NodePostgresConnectorType,
    connect,
    close,
    initTransaction: (connection) => nodePostgresTransaction(connection),
    executor: nodePostgresSQLExecutor,
  });
};

export const nodePostgresPoolClientConnection = (
  options: NodePostgresPoolClientOptions,
): NodePostgresPoolClientConnection => {
  const { connect, close } = options;

  return createConnection({
    type: NodePostgresConnectorType,
    connect,
    close,
    initTransaction: (connection) => nodePostgresTransaction(connection),
    executor: nodePostgresSQLExecutor,
  });
};

export function nodePostgresConnection(
  options: NodePostgresPoolClientOptions,
): NodePostgresPoolClientConnection;
export function nodePostgresConnection(
  options: NodePostgresClientOptions,
): NodePostgresClientConnection;
export function nodePostgresConnection(
  options: NodePostgresPoolClientOptions | NodePostgresClientOptions,
): NodePostgresPoolClientConnection | NodePostgresClientConnection {
  return options.type === 'Client'
    ? nodePostgresClientConnection(options)
    : nodePostgresPoolClientConnection(options);
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
    connectionString: connectionString,
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
