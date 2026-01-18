import {
  SQLiteConnectionString,
  sqliteSQLExecutor,
  type SQLiteDriverType,
} from '..';
import {
  createAmbientConnection,
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

export type SQLiteConnectionOptions = {
  allowNestedTransactions?: boolean;
} & SQLiteClientOptions;

export type SQLiteClientConnectionDefinitionOptions<
  SQLiteConnectionType extends
    AnySQLiteClientConnection = AnySQLiteClientConnection,
  ConnectionOptions = SQLiteConnectionOptions,
> = {
  driverType: InferDriverTypeFromConnection<SQLiteConnectionType>;
  type: 'Client';
  sqliteClientFactory: SQLiteClientFactory<
    InferDbClientFromConnection<SQLiteConnectionType>,
    ConnectionOptions
  >;
  connectionOptions: SQLiteConnectionOptions;
};

export type SQLitePoolConnectionDefinitionOptions<
  SQLiteConnectionType extends
    AnySQLitePoolClientConnection = AnySQLitePoolClientConnection,
  ConnectionOptions = SQLiteConnectionOptions,
> = {
  driverType: InferDriverTypeFromConnection<SQLiteConnectionType>;
  type: 'PoolClient';
  sqliteClientFactory: SQLiteClientFactory<
    InferDbClientFromConnection<SQLiteConnectionType>,
    ConnectionOptions
  >;
  connectionOptions: SQLiteConnectionOptions;
};

export type SQLiteConnectionDefinitionOptions<
  SQLiteConnectionType extends
    AnySQLitePoolClientConnection = AnySQLitePoolClientConnection,
  ClientOptions = SQLiteClientOptions,
> =
  | SQLiteClientConnectionDefinitionOptions<SQLiteConnectionType, ClientOptions>
  | SQLitePoolConnectionDefinitionOptions<SQLiteConnectionType, ClientOptions>;

export type SQLiteConnectionFactory<
  SQLiteConnectionType extends AnySQLiteConnection = AnySQLiteConnection,
  ConnectionOptions extends SQLiteConnectionOptions = SQLiteConnectionOptions,
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

export type SqliteAmbientClientConnectionOptions<
  SQLiteConnectionType extends
    AnySQLiteClientConnection = AnySQLiteClientConnection,
> = {
  driverType: SQLiteConnectionType['driverType'];
  client: InferDbClientFromConnection<SQLiteConnectionType>;
};

export const sqliteAmbientClientConnection = <
  SQLiteConnectionType extends
    AnySQLiteClientConnection = AnySQLiteClientConnection,
>(
  options: SqliteAmbientClientConnectionOptions<SQLiteConnectionType>,
) => {
  const { client, driverType } = options;

  return createAmbientConnection<SQLiteConnectionType>({
    driverType,
    client,
    initTransaction: (connection) =>
      sqliteTransaction(driverType, connection, false),
    executor: () => sqliteSQLExecutor(driverType),
  });
};

export const sqliteClientConnection = <
  SQLiteConnectionType extends
    AnySQLiteClientConnection = AnySQLiteClientConnection,
  ClientOptions = SQLiteClientOptions,
>(
  options: SQLiteClientConnectionDefinitionOptions<
    SQLiteConnectionType,
    ClientOptions
  >,
): SQLiteConnectionType => {
  const { connectionOptions, sqliteClientFactory } = options;

  let client:
    | (InferDbClientFromConnection<SQLiteConnectionType> & SQLiteClient)
    | null = null;

  const connect = async (): Promise<
    InferDbClientFromConnection<SQLiteConnectionType>
  > => {
    if (client) return Promise.resolve(client);

    client = sqliteClientFactory(connectionOptions as ClientOptions);

    await (client as SQLiteClient).connect();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return client!;
  };

  return createConnection({
    driverType: options.driverType,
    connect,
    close: () =>
      client !== null ? (client as SQLiteClient).close() : Promise.resolve(),
    initTransaction: (connection) =>
      sqliteTransaction(
        options.driverType,
        connection,
        connectionOptions.allowNestedTransactions ?? false,
      ),
    executor: () => sqliteSQLExecutor(options.driverType),
  });
};

export const sqlitePoolClientConnection = <
  SQLiteConnectionType extends
    AnySQLiteClientConnection = AnySQLiteClientConnection,
  ClientOptions = SQLiteClientOptions,
>(
  options: SQLitePoolConnectionDefinitionOptions<
    SQLiteConnectionType,
    ClientOptions
  >,
): SQLiteConnectionType => {
  const { connectionOptions, sqliteClientFactory } = options;

  let client:
    | (InferDbClientFromConnection<SQLiteConnectionType> & SQLiteClient)
    | null = null;

  const connect = async (): Promise<
    InferDbClientFromConnection<SQLiteConnectionType>
  > => {
    if (client) return Promise.resolve(client);

    client = sqliteClientFactory(connectionOptions as ClientOptions);

    await (client as SQLiteClient).connect();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return client!;
  };

  return createConnection({
    driverType: options.driverType,
    connect,
    close: () =>
      client !== null
        ? Promise.resolve((client as SQLitePoolClient).release())
        : Promise.resolve(),
    initTransaction: (connection) =>
      sqliteTransaction(
        options.driverType,
        connection,
        connectionOptions.allowNestedTransactions ?? false,
      ),
    executor: () => sqliteSQLExecutor(options.driverType),
  });
};

export function sqliteConnection<
  SQLiteConnectionType extends AnySQLiteConnection = AnySQLiteConnection,
  ClientOptions = SQLiteClientOptions,
>(
  options: SQLiteConnectionDefinitionOptions<
    SQLiteConnectionType,
    ClientOptions
  >,
): SQLiteConnectionType {
  return options.type === 'Client'
    ? sqliteClientConnection(options)
    : sqlitePoolClientConnection(options);
}

export type InMemorySQLiteDatabase = ':memory:';
export const InMemorySQLiteDatabase = SQLiteConnectionString(':memory:');

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type SQLiteClientOptions = {};

export * from './connectionString';
