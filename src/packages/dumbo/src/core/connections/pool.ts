import {
  executeInAmbientConnection,
  executeInNewConnection,
  sqlExecutorInAmbientConnection,
  sqlExecutorInNewConnection,
  type WithSQLExecutor,
} from '../execute';
import {
  type AnyConnection,
  type InferDbClientFromConnection,
  type WithConnectionFactory,
} from './connection';
import {
  transactionFactoryWithAmbientConnection,
  transactionFactoryWithNewConnection,
  type DatabaseTransaction,
  type DatabaseTransactionOptions,
  type WithDatabaseTransactionFactory,
} from './transaction';

export interface ConnectionPool<
  ConnectionType extends AnyConnection = AnyConnection,
  TransactionType extends DatabaseTransaction<ConnectionType> =
    DatabaseTransaction<ConnectionType>,
  TransactionOptionsType extends DatabaseTransactionOptions =
    DatabaseTransactionOptions,
>
  extends
    WithSQLExecutor,
    WithConnectionFactory<ConnectionType>,
    WithDatabaseTransactionFactory<
      ConnectionType,
      TransactionType,
      TransactionOptionsType
    > {
  driverType: ConnectionType['driverType'];
  close: () => Promise<void>;
}

export type ConnectionPoolFactory<
  ConnectionPoolType extends ConnectionPool = ConnectionPool,
  ConnectionPoolOptions = unknown,
> = (options: ConnectionPoolOptions) => ConnectionPoolType;

export const createAmbientConnectionPool = <
  ConnectionType extends AnyConnection,
>(options: {
  driverType: ConnectionType['driverType'];
  connection: ConnectionType;
}): ConnectionPool<ConnectionType> => {
  const { driverType, connection } = options;

  return createConnectionPool<ConnectionType>({
    driverType,
    getConnection: () => connection,
    execute: connection.execute,
    transaction: (options) => connection.transaction(options),
    withConnection: (handle) => handle(connection),
    withTransaction: (handle, options) =>
      connection.withTransaction(handle, options),
  });
};

export type CreateSingletonConnectionPoolOptions<
  ConnectionType extends AnyConnection,
> = {
  driverType: ConnectionType['driverType'];
  getConnection: () => ConnectionType;
  connectionOptions?: never;
};

export const createSingletonConnectionPool = <
  ConnectionType extends AnyConnection,
>(
  options: CreateSingletonConnectionPoolOptions<ConnectionType>,
): ConnectionPool<ConnectionType> => {
  const { driverType, getConnection } = options;
  let connection: ConnectionType | null = null;

  const getExistingOrNewConnection = () =>
    connection ?? (connection = getConnection());

  const getExistingOrNewConnectionAsync = () =>
    Promise.resolve(getExistingOrNewConnection());

  const result: ConnectionPool<ConnectionType> = {
    driverType,
    connection: getExistingOrNewConnectionAsync,
    execute: sqlExecutorInAmbientConnection({
      driverType,
      connection: getExistingOrNewConnectionAsync,
    }),
    withConnection: <Result>(
      handle: (connection: ConnectionType) => Promise<Result>,
    ) =>
      executeInAmbientConnection<ConnectionType, Result>(handle, {
        connection: getExistingOrNewConnectionAsync,
      }),
    ...transactionFactoryWithAmbientConnection(getExistingOrNewConnection),
    close: () => {
      return connection !== null ? connection.close() : Promise.resolve();
    },
  };

  return result;
};

export type CreateSingletonClientPoolOptions<
  ConnectionType extends AnyConnection,
> = {
  driverType: ConnectionType['driverType'];
  dbClient: InferDbClientFromConnection<ConnectionType>;
  connectionFactory: (options: {
    dbClient: InferDbClientFromConnection<ConnectionType>;
  }) => ConnectionType;
};

export const createSingletonClientPool = <ConnectionType extends AnyConnection>(
  options: CreateSingletonClientPoolOptions<ConnectionType>,
): ConnectionPool<ConnectionType> => {
  const { driverType, dbClient } = options;

  return createSingletonConnectionPool({
    getConnection: () => options.connectionFactory({ dbClient }),
    driverType,
  });
};

export type CreateAlwaysNewConnectionPoolOptions<
  ConnectionType extends AnyConnection,
  ConnectionOptions extends Record<string, unknown> | undefined = undefined,
> = ConnectionOptions extends undefined
  ? {
      driverType: ConnectionType['driverType'];
      getConnection: () => ConnectionType;
      connectionOptions?: never;
    }
  : {
      driverType: ConnectionType['driverType'];
      getConnection: (options: ConnectionOptions) => ConnectionType;
      connectionOptions: ConnectionOptions;
    };

export const createAlwaysNewConnectionPool = <
  ConnectionType extends AnyConnection,
  ConnectionOptions extends Record<string, unknown> | undefined = undefined,
>(
  options: CreateAlwaysNewConnectionPoolOptions<
    ConnectionType,
    ConnectionOptions
  >,
): ConnectionPool<ConnectionType> => {
  const { driverType, getConnection, connectionOptions } = options;

  return createConnectionPool({
    driverType,
    getConnection: () =>
      connectionOptions ? getConnection(connectionOptions) : getConnection(),
  });
};

export type CreateConnectionPoolOptions<ConnectionType extends AnyConnection> =
  Pick<ConnectionPool<ConnectionType>, 'driverType'> &
    Partial<ConnectionPool<ConnectionType>> & {
      getConnection: () => ConnectionType;
    };

export const createConnectionPool = <ConnectionType extends AnyConnection>(
  pool: CreateConnectionPoolOptions<ConnectionType>,
): ConnectionPool<ConnectionType> => {
  const { driverType, getConnection } = pool;

  const connection =
    'connection' in pool
      ? pool.connection
      : () => Promise.resolve(getConnection());

  const withConnection =
    'withConnection' in pool
      ? pool.withConnection
      : <Result>(handle: (connection: ConnectionType) => Promise<Result>) =>
          executeInNewConnection<ConnectionType, Result>(handle, {
            connection,
          });

  const close = 'close' in pool ? pool.close : () => Promise.resolve();

  const execute =
    'execute' in pool
      ? pool.execute
      : sqlExecutorInNewConnection({
          driverType,
          connection,
        });

  const transaction =
    'transaction' in pool && 'withTransaction' in pool
      ? {
          transaction: pool.transaction,
          withTransaction: pool.withTransaction,
        }
      : transactionFactoryWithNewConnection(getConnection);

  const result: ConnectionPool<ConnectionType> = {
    driverType,
    connection,
    withConnection,
    close,
    execute,
    ...transaction,
  };

  return result;
};
