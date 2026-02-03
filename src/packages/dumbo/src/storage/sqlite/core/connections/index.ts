import {
  SQLiteConnectionString,
  sqliteSQLExecutor,
  type SQLiteDriverType,
} from '..';
import {
  createAmbientConnection,
  createConnection,
  JSONSerializer,
  type AnyConnection,
  type Connection,
  type ConnectionOptions,
  type DatabaseTransaction,
  type DatabaseTransactionOptions,
  type InferDbClientFromConnection,
  type InferDriverTypeFromConnection,
  type InitTransaction,
  type SQLCommandOptions,
  type SQLExecutor,
} from '../../../../core';
import { sqliteTransaction } from '../transactions';

export type SQLiteCommandOptions = SQLCommandOptions & {
  ignoreChangesCount?: boolean;
};

export type SQLiteParameters =
  | object
  | string
  | bigint
  | number
  | boolean
  | null;

export type SQLiteClient = {
  connect: () => Promise<void>;
  close: () => Promise<void>;
} & SQLExecutor;

export type SQLitePoolClient = {
  release: () => void;
} & SQLExecutor;

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
  Self extends AnyConnection = AnyConnection,
  DriverType extends SQLiteDriverType = SQLiteDriverType,
  SQLiteClientType extends SQLiteClient = SQLiteClient,
  TransactionType extends DatabaseTransaction<Self> = DatabaseTransaction<Self>,
  TransactionOptionsType extends DatabaseTransactionOptions =
    DatabaseTransactionOptions,
> = Connection<
  Self,
  DriverType,
  SQLiteClientType,
  TransactionType,
  TransactionOptionsType
>;

export type SQLitePoolClientConnection<
  Self extends AnyConnection = AnyConnection,
  DriverType extends SQLiteDriverType = SQLiteDriverType,
  SQLitePoolClientType extends SQLitePoolClient = SQLitePoolClient,
  TransactionType extends DatabaseTransaction<Self> = DatabaseTransaction<Self>,
  TransactionOptionsType extends DatabaseTransactionOptions =
    DatabaseTransactionOptions,
> = Connection<
  Self,
  DriverType,
  SQLitePoolClientType,
  TransactionType,
  TransactionOptionsType
>;

export type SQLiteConnection<
  Self extends AnyConnection = AnyConnection,
  DriverType extends SQLiteDriverType = SQLiteDriverType,
  SQLiteClientType extends SQLiteClientOrPoolClient =
    | SQLiteClient
    | SQLitePoolClient,
  TransactionType extends DatabaseTransaction<Self> = DatabaseTransaction<Self>,
  TransactionOptionsType extends DatabaseTransactionOptions =
    DatabaseTransactionOptions,
> =
  | (SQLiteClientType extends SQLiteClient
      ? SQLiteClientConnection<
          Self,
          DriverType,
          SQLiteClientType,
          TransactionType,
          TransactionOptionsType
        >
      : never)
  | (SQLiteClientType extends SQLitePoolClient
      ? SQLitePoolClientConnection<
          Self,
          DriverType,
          SQLiteClientType,
          TransactionType,
          TransactionOptionsType
        >
      : never);

export type AnySQLiteClientConnection =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SQLiteClientConnection<any, any>;

export type AnySQLitePoolClientConnection =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SQLitePoolClientConnection<any, any, any, any, any>;

export type AnySQLiteConnection =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SQLiteConnection<any, any, any, any, any>;

export type SQLiteConnectionOptions<
  ConnectionType extends AnySQLiteConnection = AnySQLiteConnection,
> = ConnectionOptions<ConnectionType> & SQLiteClientOptions;

export type SQLiteClientConnectionDefinitionOptions<
  SQLiteConnectionType extends AnySQLiteClientConnection =
    AnySQLiteClientConnection,
  ConnectionOptions = SQLiteConnectionOptions,
> = {
  driverType: InferDriverTypeFromConnection<SQLiteConnectionType>;
  type: 'Client';
  sqliteClientFactory: SQLiteClientFactory<
    InferDbClientFromConnection<SQLiteConnectionType>,
    ConnectionOptions
  >;
  connectionOptions: SQLiteConnectionOptions<SQLiteConnectionType>;
  serializer: JSONSerializer;
};

export type SQLitePoolConnectionDefinitionOptions<
  SQLiteConnectionType extends AnySQLitePoolClientConnection =
    AnySQLitePoolClientConnection,
  ConnectionOptions = SQLiteConnectionOptions,
> = {
  driverType: InferDriverTypeFromConnection<SQLiteConnectionType>;
  type: 'PoolClient';
  sqliteClientFactory: SQLiteClientFactory<
    InferDbClientFromConnection<SQLiteConnectionType>,
    ConnectionOptions
  >;
  connectionOptions: SQLiteConnectionOptions<SQLiteConnectionType>;
  serializer: JSONSerializer;
};

export type SQLiteConnectionDefinitionOptions<
  SQLiteConnectionType extends AnySQLitePoolClientConnection =
    AnySQLitePoolClientConnection,
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
  SQLiteConnectionType extends AnySQLiteClientConnection =
    AnySQLiteClientConnection,
  TransactionType extends DatabaseTransaction<SQLiteConnectionType> =
    DatabaseTransaction<SQLiteConnectionType>,
  TransactionOptionsType extends DatabaseTransactionOptions =
    DatabaseTransactionOptions,
> = {
  driverType: SQLiteConnectionType['driverType'];
  client: InferDbClientFromConnection<SQLiteConnectionType>;
  initTransaction?: InitTransaction<
    SQLiteConnectionType,
    TransactionType,
    TransactionOptionsType
  >;
  allowNestedTransactions?: boolean;
  serializer: JSONSerializer;
};

export const sqliteAmbientClientConnection = <
  SQLiteConnectionType extends AnySQLiteClientConnection =
    AnySQLiteClientConnection,
>(
  options: SqliteAmbientClientConnectionOptions<SQLiteConnectionType>,
) => {
  const {
    client,
    driverType,
    initTransaction,
    allowNestedTransactions,
    serializer,
  } = options;

  return createAmbientConnection<SQLiteConnectionType>({
    driverType,
    client,
    initTransaction:
      initTransaction ??
      ((connection) =>
        sqliteTransaction(
          driverType,
          connection,
          allowNestedTransactions ?? false,
          serializer,
        )),
    executor: ({ serializer }) => sqliteSQLExecutor(driverType, serializer),
    serializer,
  });
};

export const sqliteClientConnection = <
  SQLiteConnectionType extends AnySQLiteClientConnection =
    AnySQLiteClientConnection,
  ClientOptions = SQLiteClientOptions,
>(
  options: SQLiteClientConnectionDefinitionOptions<
    SQLiteConnectionType,
    ClientOptions
  >,
): SQLiteConnectionType => {
  const { connectionOptions, sqliteClientFactory, serializer } = options;

  let client: InferDbClientFromConnection<SQLiteConnectionType> | null = null;

  const connect = async (): Promise<
    InferDbClientFromConnection<SQLiteConnectionType>
  > => {
    if (client) return Promise.resolve(client);

    client = sqliteClientFactory(connectionOptions as ClientOptions);

    if (client && 'connect' in client && typeof client.connect === 'function')
      await client.connect();

    return client;
  };

  return createConnection({
    driverType: options.driverType,
    connect,
    close: async () => {
      if (client && 'close' in client && typeof client.close === 'function')
        await client.close();
      else if (
        client &&
        'release' in client &&
        typeof client.release === 'function'
      )
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        client.release();
    },
    initTransaction: (connection) =>
      sqliteTransaction(
        options.driverType,
        connection,
        connectionOptions.transactionOptions?.allowNestedTransactions ?? false,
        serializer,
      ),
    executor: ({ serializer }) =>
      sqliteSQLExecutor(options.driverType, serializer),
    serializer,
  });
};

export const sqlitePoolClientConnection = <
  SQLiteConnectionType extends AnySQLiteClientConnection =
    AnySQLiteClientConnection,
  ClientOptions = SQLiteClientOptions,
>(
  options: SQLitePoolConnectionDefinitionOptions<
    SQLiteConnectionType,
    ClientOptions
  >,
): SQLiteConnectionType => {
  const { connectionOptions, sqliteClientFactory, serializer } = options;

  let client: InferDbClientFromConnection<SQLiteConnectionType> | null = null;

  const connect = async (): Promise<
    InferDbClientFromConnection<SQLiteConnectionType>
  > => {
    if (client) return Promise.resolve(client);

    client = sqliteClientFactory(connectionOptions as ClientOptions);

    await client.connect();

    return client;
  };

  return createConnection({
    driverType: options.driverType,
    connect,
    close: () =>
      client !== null
        ? Promise.resolve((client as unknown as SQLitePoolClient).release())
        : Promise.resolve(),
    initTransaction: (connection) =>
      sqliteTransaction(
        options.driverType,
        connection,
        connectionOptions.transactionOptions?.allowNestedTransactions ?? false,
        serializer,
      ),
    executor: ({ serializer }) =>
      sqliteSQLExecutor(options.driverType, serializer),
    serializer,
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
