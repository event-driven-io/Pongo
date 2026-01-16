import {
  SQLiteConnectionString,
  sqliteSQLExecutor,
  type SQLiteDriverType,
} from '..';
import {
  createConnection,
  type Connection,
  type InitTransaction,
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

export type SQLitePoolConnectionOptions<
  DriverType extends SQLiteDriverType = SQLiteDriverType,
  SQLitePoolClientType extends SQLitePoolClient = SQLitePoolClient,
> = {
  driverType: DriverType;
  type: 'PoolClient';
  connect: () => Promise<SQLitePoolClientType>;
  close: (client: SQLitePoolClientType) => Promise<void>;
  transaction: {
    allowNestedTransactions: boolean;
    initTransaction?: InitTransaction<
      DriverType,
      SQLitePoolClientType,
      SQLitePoolClientConnection<DriverType, SQLitePoolClientType>
    >;
  };
};

export type SQLiteClientConnectionOptions<
  DriverType extends SQLiteDriverType = SQLiteDriverType,
  SQLiteClientType extends SQLiteClient = SQLiteClient,
> = {
  driverType: DriverType;
  type: 'Client';
  connect: () => Promise<SQLiteClientType>;
  close: (client: SQLiteClientType) => Promise<void>;
  transaction: {
    allowNestedTransactions: boolean;
    initTransaction?: InitTransaction<
      DriverType,
      SQLiteClientType,
      SQLiteClientConnection<DriverType, SQLiteClientType>
    >;
  };
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

export type AnySQLiteConnection =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | SQLiteClientConnection<any, any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | SQLitePoolClientConnection<any, any>;

export type SQLiteConnectionFactory<
  SQLiteConnectionType extends AnySQLiteConnection = AnySQLiteConnection,
  ConnectionOptions = SQLiteClientOptions,
> = (options: ConnectionOptions) => SQLiteConnectionType;

export const sqliteClientConnection = <
  DriverType extends SQLiteDriverType = SQLiteDriverType,
  SQLiteClientType extends SQLiteClient = SQLiteClient,
>(
  options: SQLiteClientConnectionOptions<DriverType, SQLiteClientType>,
): SQLiteClientConnection<DriverType, SQLiteClientType> => {
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

export const sqlitePoolClientConnection = <
  DriverType extends SQLiteDriverType = SQLiteDriverType,
  SQLitePoolClientType extends SQLitePoolClient = SQLitePoolClient,
>(
  options: SQLitePoolConnectionOptions<DriverType, SQLitePoolClientType>,
): SQLitePoolClientConnection<DriverType, SQLitePoolClientType> => {
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
  DriverType extends SQLiteDriverType = SQLiteDriverType,
  SQLitePoolClientType extends SQLitePoolClient = SQLitePoolClient,
>(
  options: SQLitePoolConnectionOptions<DriverType, SQLitePoolClientType>,
): SQLitePoolClientConnection<DriverType, SQLitePoolClientType>;

export function sqliteConnection<
  DriverType extends SQLiteDriverType = SQLiteDriverType,
  SQLiteClientType extends SQLiteClient = SQLiteClient,
>(
  options: SQLiteClientConnectionOptions<DriverType, SQLiteClientType>,
): SQLiteClientConnection<DriverType, SQLiteClientType>;

export function sqliteConnection<
  DriverType extends SQLiteDriverType = SQLiteDriverType,
>(
  options:
    | SQLitePoolConnectionOptions<DriverType>
    | SQLiteClientConnectionOptions<DriverType>,
): SQLitePoolClientConnection<DriverType> | SQLiteClientConnection<DriverType> {
  return options.type === 'Client'
    ? sqliteClientConnection<DriverType>(options)
    : sqlitePoolClientConnection<DriverType>(options);
}

export type InMemorySQLiteDatabase = ':memory:';
export const InMemorySQLiteDatabase = SQLiteConnectionString(':memory:');

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type SQLiteClientOptions = {};

export * from './connectionString';
