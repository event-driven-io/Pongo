import {
  mapSqliteError,
  SQLiteConnectionString,
  sqliteSQLExecutor,
  type SQLiteDriverType,
  type SQLiteErrorMapper,
} from '..';
import type { JSONSerializer } from '../../../../core';
import {
  createAmbientConnection,
  createConnection,
  type AnyConnection,
  type BatchSQLCommandOptions,
  type Connection,
  type ConnectionOptions,
  type DatabaseTransaction,
  type InferDbClientFromConnection,
  type InferDriverTypeFromConnection,
  type InitTransaction,
  type SQLCommandOptions,
  type SQLExecutor,
} from '../../../../core';
import { sqliteTransaction, type SQLiteTransactionMode } from '../transactions';

export type SQLiteCommandOptions = SQLCommandOptions & {
  ignoreChangesCount?: boolean;
};

export type BatchSQLiteCommandOptions = SQLiteCommandOptions &
  BatchSQLCommandOptions;

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
> = Connection<Self, DriverType, SQLiteClientType, TransactionType>;

export type SQLitePoolClientConnection<
  Self extends AnyConnection = AnyConnection,
  DriverType extends SQLiteDriverType = SQLiteDriverType,
  SQLitePoolClientType extends SQLitePoolClient = SQLitePoolClient,
  TransactionType extends DatabaseTransaction<Self> = DatabaseTransaction<Self>,
> = Connection<Self, DriverType, SQLitePoolClientType, TransactionType>;

export type SQLiteConnection<
  Self extends AnyConnection = AnyConnection,
  DriverType extends SQLiteDriverType = SQLiteDriverType,
  SQLiteClientType extends SQLiteClientOrPoolClient =
    | SQLiteClient
    | SQLitePoolClient,
  TransactionType extends DatabaseTransaction<Self> = DatabaseTransaction<Self>,
> =
  | (SQLiteClientType extends SQLiteClient
      ? SQLiteClientConnection<
          Self,
          DriverType,
          SQLiteClientType,
          TransactionType
        >
      : never)
  | (SQLiteClientType extends SQLitePoolClient
      ? SQLitePoolClientConnection<
          Self,
          DriverType,
          SQLiteClientType,
          TransactionType
        >
      : never);

export type AnySQLiteClientConnection =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SQLiteClientConnection<any, any>;

export type AnySQLitePoolClientConnection =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SQLitePoolClientConnection<any, any, any, any>;

export type AnySQLiteConnection =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SQLiteConnection<any, any, any, any>;

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
> = {
  driverType: SQLiteConnectionType['driverType'];
  client: InferDbClientFromConnection<SQLiteConnectionType>;
  initTransaction?: InitTransaction<SQLiteConnectionType>;
  allowNestedTransactions?: boolean;
  defaultTransactionMode?: SQLiteTransactionMode;
  serializer: JSONSerializer;
  errorMapper?: SQLiteErrorMapper;
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
    defaultTransactionMode,
    serializer,
    errorMapper,
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
          defaultTransactionMode,
        )),
    executor: ({ serializer }) =>
      sqliteSQLExecutor(driverType, serializer, undefined, errorMapper),
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

    if (client && 'connect' in client && typeof client.connect === 'function') {
      try {
        await client.connect();
      } catch (error) {
        throw mapSqliteError(error);
      }
    }

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
        connectionOptions.defaultTransactionMode,
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

    try {
      await client.connect();
    } catch (error) {
      throw mapSqliteError(error);
    }

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
        connectionOptions.defaultTransactionMode,
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

export type SQLitePragmaOptions = {
  journal_mode?: 'DELETE' | 'TRUNCATE' | 'PERSIST' | 'MEMORY' | 'WAL' | 'OFF';
  synchronous?: 'OFF' | 'NORMAL' | 'FULL' | 'EXTRA';
  cache_size?: number;
  foreign_keys?: boolean;
  temp_store?: 'DEFAULT' | 'FILE' | 'MEMORY';
  busy_timeout?: number;
};

export const DEFAULT_SQLITE_PRAGMA_OPTIONS: SQLitePragmaOptions = {
  journal_mode: 'WAL',
  synchronous: 'NORMAL',
  cache_size: -1000000,
  foreign_keys: true,
  temp_store: 'MEMORY',
  busy_timeout: 5000,
};

export type SQLiteClientOptions = {
  pragmaOptions?: Partial<SQLitePragmaOptions>;
  defaultTransactionMode?: SQLiteTransactionMode;
  skipDatabasePragmas?: boolean;
  readonly?: boolean;
};

export * from './connectionString';
