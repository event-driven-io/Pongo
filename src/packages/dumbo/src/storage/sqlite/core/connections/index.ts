import { sqliteSQLExecutor, type SQLiteConnectorType } from '..';
import { createConnection, type Connection } from '../../../../core';
import { sqliteTransaction } from '../transactions';

export type Parameters = object | string | bigint | number | boolean | null;

export type SQLiteClient = {
  close: () => Promise<void>;
  command: (sql: string, values?: Parameters[]) => Promise<void>;
  query: <T>(sql: string, values?: Parameters[]) => Promise<T[]>;
  querySingle: <T>(sql: string, values?: Parameters[]) => Promise<T | null>;
};

export type SQLitePoolClient = {
  release: () => void;
  command: (sql: string, values?: Parameters[]) => Promise<void>;
  query: <T>(sql: string, values?: Parameters[]) => Promise<T[]>;
  querySingle: <T>(sql: string, values?: Parameters[]) => Promise<T | null>;
};

export type SQLiteClientFactory = (
  options: SQLiteClientOptions,
) => SQLiteClient;

export type SQLiteClientOrPoolClient = SQLitePoolClient | SQLiteClient;

export interface SQLiteError extends Error {
  errno: number;
}

export const isSQLiteError = (error: unknown): error is SQLiteError => {
  if (error instanceof Error && 'code' in error) {
    return true;
  }

  return false;
};

export type SQLitePoolConnectionOptions<
  ConnectorType extends SQLiteConnectorType = SQLiteConnectorType,
> = {
  connector: ConnectorType;
  type: 'PoolClient';
  connect: Promise<SQLitePoolClient>;
  close: (client: SQLitePoolClient) => Promise<void>;
};

export type SQLiteClientConnectionOptions<
  ConnectorType extends SQLiteConnectorType = SQLiteConnectorType,
> = {
  connector: ConnectorType;
  type: 'Client';
  connect: Promise<SQLiteClient>;
  close: (client: SQLiteClient) => Promise<void>;
};

export type SQLiteClientConnection<
  ConnectorType extends SQLiteConnectorType = SQLiteConnectorType,
> = Connection<ConnectorType, SQLiteClient>;

export type SQLitePoolClientConnection<
  ConnectorType extends SQLiteConnectorType = SQLiteConnectorType,
> = Connection<ConnectorType, SQLitePoolClient>;

export type SQLiteConnection<
  ConnectorType extends SQLiteConnectorType = SQLiteConnectorType,
> =
  | SQLiteClientConnection<ConnectorType>
  | SQLitePoolClientConnection<ConnectorType>;

export const sqliteClientConnection = <
  ConnectorType extends SQLiteConnectorType = SQLiteConnectorType,
>(
  options: SQLiteClientConnectionOptions<ConnectorType>,
): SQLiteClientConnection<ConnectorType> => {
  const { connect, close } = options;

  return createConnection({
    connector: options.connector,
    connect,
    close,
    initTransaction: (connection) =>
      sqliteTransaction(options.connector, connection),
    executor: () => sqliteSQLExecutor(options.connector),
  });
};

export const sqlitePoolClientConnection = <
  ConnectorType extends SQLiteConnectorType = SQLiteConnectorType,
>(
  options: SQLitePoolConnectionOptions<ConnectorType>,
): SQLitePoolClientConnection<ConnectorType> => {
  const { connect, close } = options;

  return createConnection({
    connector: options.connector,
    connect,
    close,
    initTransaction: (connection) =>
      sqliteTransaction(options.connector, connection),
    executor: () => sqliteSQLExecutor(options.connector),
  });
};

export function sqliteConnection<
  ConnectorType extends SQLiteConnectorType = SQLiteConnectorType,
>(
  options: SQLitePoolConnectionOptions<ConnectorType>,
): SQLitePoolClientConnection;
export function sqliteConnection<
  ConnectorType extends SQLiteConnectorType = SQLiteConnectorType,
>(
  options: SQLiteClientConnectionOptions<ConnectorType>,
): SQLiteClientConnection;
export function sqliteConnection<
  ConnectorType extends SQLiteConnectorType = SQLiteConnectorType,
>(
  options:
    | SQLitePoolConnectionOptions<ConnectorType>
    | SQLiteClientConnectionOptions<ConnectorType>,
):
  | SQLitePoolClientConnection<ConnectorType>
  | SQLiteClientConnection<ConnectorType> {
  return options.type === 'Client'
    ? sqliteClientConnection<ConnectorType>(options)
    : sqlitePoolClientConnection<ConnectorType>(options);
}

export type InMemorySQLiteDatabase = ':memory:';
export const InMemorySQLiteDatabase = ':memory:';

export type SQLiteClientOptions = {
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  fileName: InMemorySQLiteDatabase | string | undefined;
};
