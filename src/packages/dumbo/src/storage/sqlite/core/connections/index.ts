import {
  SQLiteConnectionString,
  sqliteSQLExecutor,
  type SQLiteConnectionFactoryOptions,
  type SQLiteDriverType,
} from '..';
import {
  createConnection,
  type Connection,
  type DatabaseTransaction,
  type InferDbClientFromConnection,
  type InferDriverTypeFromConnection,
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
> = Connection<
  SQLiteClientConnection<DriverType, SQLiteClientType>,
  DriverType,
  SQLiteClientType,
  DatabaseTransaction<SQLiteClientConnection<DriverType, SQLiteClientType>>
>;

export type SQLitePoolClientConnection<
  DriverType extends SQLiteDriverType = SQLiteDriverType,
  SQLitePoolClientType extends SQLitePoolClient = SQLitePoolClient,
> = Connection<
  SQLitePoolClientConnection<DriverType, SQLitePoolClientType>,
  DriverType,
  SQLitePoolClientType,
  DatabaseTransaction<
    SQLitePoolClientConnection<DriverType, SQLitePoolClientType>
  >
>;

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

export type SQLiteConnectionOptions<
  SQLiteConnectionType extends
    AnySQLiteClientConnection = AnySQLiteClientConnection,
> = {
  driverType: SQLiteConnectionType['driverType'];
  allowNestedTransactions?: boolean;
};

export type SQLiteClientConnectionDefinitionOptions<
  SQLiteConnectionType extends
    AnySQLiteClientConnection = AnySQLiteClientConnection,
  ClientOptions = SQLiteClientOptions,
> = {
  driverType: InferDriverTypeFromConnection<SQLiteConnectionType>;
  type: 'Client';
  sqliteClient: SQLiteClientFactory<
    InferDbClientFromConnection<SQLiteConnectionType>,
    ClientOptions
  >;
  connect: () => Promise<InferDbClientFromConnection<SQLiteConnectionType>>;
  close: (
    client: InferDbClientFromConnection<SQLiteConnectionType>,
  ) => Promise<void>;
  transaction: {
    allowNestedTransactions: boolean;
  };
};

export type SQLitePoolConnectionDefinitionOptions<
  SQLiteConnectionType extends
    AnySQLitePoolClientConnection = AnySQLitePoolClientConnection,
  ClientOptions = SQLiteClientOptions,
> = {
  driverType: InferDriverTypeFromConnection<SQLiteConnectionType>;
  type: 'PoolClient';
  sqliteClient: SQLiteClientFactory<
    InferDbClientFromConnection<SQLiteConnectionType>,
    ClientOptions
  >;
  connect: () => Promise<InferDbClientFromConnection<SQLiteConnectionType>>;
  close: (
    client: InferDbClientFromConnection<SQLiteConnectionType>,
  ) => Promise<void>;
  transaction: {
    allowNestedTransactions: boolean;
  };
};

export type SQLiteConnectionFactory<
  SQLiteConnectionType extends AnySQLiteConnection = AnySQLiteConnection,
  ConnectionOptions extends
    SQLiteClientConnectionDefinitionOptions<SQLiteConnectionType> = SQLiteClientConnectionDefinitionOptions<SQLiteConnectionType>,
> = (options: ConnectionOptions) => SQLiteConnectionType;

export type SQLiteConnectionDefinition<
  SQLiteConnectionType extends AnySQLiteConnection = AnySQLiteConnection,
  ConnectionOptions extends
    SQLiteClientConnectionDefinitionOptions<SQLiteConnectionType> = SQLiteClientConnectionDefinitionOptions<SQLiteConnectionType>,
> = (
  options: SQLiteConnectionFactoryOptions<
    SQLiteConnectionType,
    ConnectionOptions
  >,
) => SQLiteConnectionFactory<SQLiteConnectionType, ConnectionOptions>;

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
  options: SQLiteClientConnectionDefinitionOptions<SQLiteConnectionType>,
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
  options: SQLitePoolConnectionDefinitionOptions<SQLiteConnectionType>,
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
  options: SQLitePoolConnectionDefinitionOptions<SQLiteConnectionType>,
): SQLiteConnectionType;

export function sqliteConnection<
  SQLiteConnectionType extends
    AnySQLiteClientConnection = AnySQLiteClientConnection,
>(
  options: SQLiteClientConnectionDefinitionOptions<SQLiteConnectionType>,
): SQLiteConnectionType;

export function sqliteConnection<
  SQLiteConnectionType extends AnySQLiteConnection = AnySQLiteConnection,
>(
  options:
    | SQLitePoolConnectionDefinitionOptions<SQLiteConnectionType>
    | SQLiteClientConnectionDefinitionOptions<SQLiteConnectionType>,
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
