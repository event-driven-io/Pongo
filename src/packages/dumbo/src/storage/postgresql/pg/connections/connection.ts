import pg from 'pg';
import { createConnection, type Connection } from '../../../../core';
import type { PostgreSQLConnectorType } from '../../core';
import { nodePostgresSQLExecutor } from '../execute';
import { nodePostgresTransaction } from './transaction';

export type NodePostgresConnector = PostgreSQLConnectorType<'pg'>;
export const NodePostgresConnectorType: NodePostgresConnector = 'PostgreSQL:pg';

export type NodePostgresPoolClient = pg.PoolClient;
export type NodePostgresClient = pg.Client;

export type NodePostgresClientOrPoolClient =
  | NodePostgresPoolClient
  | NodePostgresClient;

export type NodePostgresPoolOrClient =
  | pg.Pool
  | NodePostgresPoolClient
  | NodePostgresClient;

export type NodePostgresClientConnection = Connection<
  NodePostgresConnector,
  NodePostgresClient
>;

export type NodePostgresPoolClientConnection = Connection<
  NodePostgresConnector,
  NodePostgresPoolClient
>;

export type NodePostgresConnection =
  | NodePostgresPoolClientConnection
  | NodePostgresClientConnection;

export type NodePostgresPoolClientOptions = {
  type: 'PoolClient';
  connect: Promise<NodePostgresPoolClient>;
  close: (client: NodePostgresPoolClient) => Promise<void>;
};

export type NodePostgresClientOptions = {
  type: 'Client';
  connect: Promise<NodePostgresClient>;
  close: (client: NodePostgresClient) => Promise<void>;
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
