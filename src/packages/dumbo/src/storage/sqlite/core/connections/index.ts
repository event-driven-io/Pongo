import {
  SQLiteConnectionString,
  sqliteSQLExecutor,
  type SQLiteDriverType,
} from '..';
import {
  createConnection,
  type Connection,
  type InferConnectionDbClient,
  type InferConnectionDriverType,
} from '../../../../core';
import { sqliteTransaction } from '../transactions';

export type Parameters = object | string | bigint | number | boolean | null;

export type SQLiteClient = {
  connect: () => Promise<void>;
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

export type SQLiteClientFactory<
  SQLiteClientType extends SQLiteClient = SQLiteClient,
  ClientOptions = SQLiteClientOptions,
> = (options: ClientOptions) => SQLiteClientType;

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

export type SQLiteClientConnection<
  DriverType extends SQLiteDriverType = SQLiteDriverType,
  SQLiteClientType extends SQLiteClient = SQLiteClient,
> = Connection<DriverType, SQLiteClientType>;

export type SQLitePoolClientConnection<
  DriverType extends SQLiteDriverType = SQLiteDriverType,
  SQLitePoolClientType extends SQLitePoolClient = SQLitePoolClient,
> = Connection<DriverType, SQLitePoolClientType>;

export type SQLiteConnection<
  DriverType extends SQLiteDriverType = SQLiteDriverType,
  SQLiteClientType extends SQLiteClientOrPoolClient =
    | SQLiteClient
    | SQLitePoolClient,
> =
  | (SQLiteClientType extends SQLiteClient
      ? SQLiteClientConnection<DriverType, SQLiteClientType>
      : never)
  | (SQLiteClientType extends SQLitePoolClient
      ? SQLitePoolClientConnection<DriverType, SQLiteClientType>
      : never);

export type AnySQLiteClientConnection =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SQLiteClientConnection<any, any>;

export type AnySQLitePoolClientConnection =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SQLitePoolClientConnection<any, any>;

export type AnySQLiteConnection =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SQLiteConnection<any, any>;

export type SQLiteClientConnectionOptions<
  SQLiteConnectionType extends
    AnySQLiteClientConnection = AnySQLiteClientConnection,
> = {
  driverType: InferConnectionDriverType<SQLiteConnectionType>;
  type: 'Client';
  connect: () => Promise<InferConnectionDbClient<SQLiteConnectionType>>;
  close: (
    client: InferConnectionDbClient<SQLiteConnectionType>,
  ) => Promise<void>;
  transaction: {
    allowNestedTransactions: boolean;
  };
};

export type SQLitePoolConnectionOptions<
  SQLiteConnectionType extends
    AnySQLitePoolClientConnection = AnySQLitePoolClientConnection,
> = {
  driverType: InferConnectionDriverType<SQLiteConnectionType>;
  type: 'PoolClient';
  connect: () => Promise<InferConnectionDbClient<SQLiteConnectionType>>;
  close: (
    client: InferConnectionDbClient<SQLiteConnectionType>,
  ) => Promise<void>;
  transaction: {
    allowNestedTransactions: boolean;
  };
};

export type SQLiteConnectionFactory<
  SQLiteConnectionType extends AnySQLiteConnection = AnySQLiteConnection,
  ConnectionOptions extends
    SQLiteClientConnectionOptions<SQLiteConnectionType> = SQLiteClientConnectionOptions<SQLiteConnectionType>,
> = (options: ConnectionOptions) => SQLiteConnectionType;

export type TransactionNestingCounter = {
  increment: () => void;
  decrement: () => void;
  reset: () => void;
  level: number;
};

export const transactionNestingCounter = (): TransactionNestingCounter => {
  let transactionLevel = 0;

  return {
    reset: () => {
      transactionLevel = 0;
    },
    increment: () => {
      transactionLevel++;
    },
    decrement: () => {
      transactionLevel--;

      if (transactionLevel < 0) {
        throw new Error('Transaction level is out of bounds');
      }
    },
    get level() {
      return transactionLevel;
    },
  };
};

export const sqliteClientConnection = <
  SQLiteConnectionType extends
    AnySQLiteClientConnection = AnySQLiteClientConnection,
>(
  options: SQLiteClientConnectionOptions<SQLiteConnectionType>,
): SQLiteConnectionType => {
  const {
    connect,
    close,
    transaction: { allowNestedTransactions },
  } = options;

  return createConnection({
    driverType: options.driverType,
    connect,
    close,
    initTransaction: (connection) =>
      sqliteTransaction(
        options.driverType,
        connection,
        allowNestedTransactions,
      ),
    executor: () => sqliteSQLExecutor(options.driverType),
  });
};

export const sqlitePoolClientConnection = <
  SQLiteConnectionType extends
    AnySQLiteClientConnection = AnySQLiteClientConnection,
>(
  options: SQLitePoolConnectionOptions<SQLiteConnectionType>,
): SQLiteConnectionType => {
  const {
    connect,
    close,
    transaction: { allowNestedTransactions },
  } = options;

  return createConnection({
    driverType: options.driverType,
    connect,
    close,
    initTransaction: (connection) =>
      sqliteTransaction(
        options.driverType,
        connection,
        allowNestedTransactions ?? false,
      ),
    executor: () => sqliteSQLExecutor(options.driverType),
  });
};

export function sqliteConnection<
  SQLiteConnectionType extends
    AnySQLiteClientConnection = AnySQLiteClientConnection,
>(
  options: SQLitePoolConnectionOptions<SQLiteConnectionType>,
): SQLiteConnectionType;

export function sqliteConnection<
  SQLiteConnectionType extends
    AnySQLiteClientConnection = AnySQLiteClientConnection,
>(
  options: SQLiteClientConnectionOptions<SQLiteConnectionType>,
): SQLiteConnectionType;

export function sqliteConnection<
  SQLiteConnectionType extends AnySQLiteConnection = AnySQLiteConnection,
>(
  options:
    | SQLitePoolConnectionOptions<SQLiteConnectionType>
    | SQLiteClientConnectionOptions<SQLiteConnectionType>,
): SQLiteConnectionType {
  return options.type === 'Client'
    ? sqliteClientConnection<SQLiteConnectionType>(options)
    : sqlitePoolClientConnection<SQLiteConnectionType>(options);
}

export type InMemorySQLiteDatabase = ':memory:';
export const InMemorySQLiteDatabase = SQLiteConnectionString(':memory:');

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type SQLiteClientOptions = {};

export * from './connectionString';
