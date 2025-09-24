import {
  SQLiteConnectionString,
  sqliteSQLExecutor,
  type SQLiteDriverType,
  type SQLiteFileNameOrConnectionString,
} from '..';
import { createConnection, type Connection } from '../../../../core';
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
  DriverType extends SQLiteDriverType = SQLiteDriverType,
> = {
  driverType: DriverType;
  type: 'PoolClient';
  connect: () => Promise<SQLitePoolClient>;
  close: (client: SQLitePoolClient) => Promise<void>;
  allowNestedTransactions: boolean;
};

export type SQLiteClientConnectionOptions<
  DriverType extends SQLiteDriverType = SQLiteDriverType,
> = {
  driverType: DriverType;
  type: 'Client';
  connect: () => Promise<SQLiteClient>;
  close: (client: SQLiteClient) => Promise<void>;
  allowNestedTransactions: boolean;
};

export type SQLiteClientConnection<
  DriverType extends SQLiteDriverType = SQLiteDriverType,
> = Connection<DriverType, SQLiteClient>;

export type SQLitePoolClientConnection<
  DriverType extends SQLiteDriverType = SQLiteDriverType,
> = Connection<DriverType, SQLitePoolClient>;

export type SQLiteConnection<
  DriverType extends SQLiteDriverType = SQLiteDriverType,
> = SQLiteClientConnection<DriverType> | SQLitePoolClientConnection<DriverType>;

export const sqliteClientConnection = <
  DriverType extends SQLiteDriverType = SQLiteDriverType,
>(
  options: SQLiteClientConnectionOptions<DriverType>,
): SQLiteClientConnection<DriverType> => {
  const { connect, close, allowNestedTransactions } = options;

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
>(
  options: SQLitePoolConnectionOptions<DriverType>,
): SQLitePoolClientConnection<DriverType> => {
  const { connect, close, allowNestedTransactions } = options;

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
>(options: SQLitePoolConnectionOptions<DriverType>): SQLitePoolClientConnection;

export function sqliteConnection<
  DriverType extends SQLiteDriverType = SQLiteDriverType,
>(options: SQLiteClientConnectionOptions<DriverType>): SQLiteClientConnection;

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

export type SQLiteClientOptions = SQLiteFileNameOrConnectionString;

export * from './connectionString';
