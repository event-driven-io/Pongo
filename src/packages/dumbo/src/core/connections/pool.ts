import {
  executeInAmbientConnection,
  executeInNewConnection,
  sqlExecutorInAmbientConnection,
  sqlExecutorInNewConnection,
  type WithSQLExecutor,
} from '../execute';
import type { AbortOptions } from '../taskProcessing';
import {
  Abort,
  guardBoundedAccess,
  guardConcurrentAccess,
} from '../taskProcessing';
import type {
  AnyConnection,
  InferDbClientFromConnection,
  InferTransactionFromConnection,
  WithConnectionFactory,
  WithConnectionOptions,
} from './connection';
import {
  transactionFactoryWithAsyncAmbientConnection,
  transactionFactoryWithNewConnection,
  type WithDatabaseTransactionFactory,
} from './transaction';

export type PoolCloseOptions = {
  force?: boolean;
  closeDeadline?: number;
};

export interface ConnectionPool<
  ConnectionType extends AnyConnection = AnyConnection,
>
  extends
    WithSQLExecutor,
    WithConnectionFactory<ConnectionType>,
    WithDatabaseTransactionFactory<ConnectionType> {
  driverType: ConnectionType['driverType'];
  close: (options?: PoolCloseOptions) => Promise<void>;
}

const wrapPooledConnection = <ConnectionType extends AnyConnection>(
  conn: ConnectionType,
  onClose: () => Promise<void>,
): ConnectionType => ({ ...conn, close: onClose });

export type ConnectionPoolFactory<
  ConnectionPoolType extends ConnectionPool = ConnectionPool,
  ConnectionPoolOptions = unknown,
> = (options: ConnectionPoolOptions) => ConnectionPoolType;

export type AmbientConnectionPoolOptions<ConnectionType extends AnyConnection> =
  {
    driverType: ConnectionType['driverType'];
    connection: ConnectionType;
  };

export const createAmbientConnectionPool = <
  ConnectionType extends AnyConnection,
>(
  options: AmbientConnectionPoolOptions<ConnectionType>,
): ConnectionPool<ConnectionType> => {
  const { driverType, connection } = options;

  return createConnectionPool<ConnectionType>({
    driverType,
    getConnection: () => connection,
    execute: connection.execute,
    transaction: (options) =>
      connection.transaction(
        options,
      ) as InferTransactionFromConnection<ConnectionType>,
    withConnection: (handle, options) =>
      handle(connection, { abort: Abort.from(options) }),
    withTransaction: (handle, options) => {
      const withTx =
        connection.withTransaction as WithDatabaseTransactionFactory<ConnectionType>['withTransaction'];
      return Abort.execute(() => withTx(handle, options), options);
    },
  });
};

export type SingletonConnectionPoolOptions<
  ConnectionType extends AnyConnection,
> = {
  driverType: ConnectionType['driverType'];
  getConnection: () => ConnectionType | Promise<ConnectionType>;
  closeConnection?: (connection: ConnectionType) => void | Promise<void>;
  connectionOptions?: never;
};

export const createSingletonConnectionPool = <
  ConnectionType extends AnyConnection,
>(
  options: SingletonConnectionPoolOptions<ConnectionType>,
): ConnectionPool<ConnectionType> => {
  const { driverType, getConnection } = options;

  let connectionPromise: Promise<ConnectionType> | null = null;
  let closed = false;
  const operationGuard = guardConcurrentAccess();

  const closedError = () =>
    new Error('Singleton connection pool has been closed');

  const executeIfOpen = async <Result>(
    operation: (context: { abort: Abort }) => Promise<Result>,
    operationOptions?: AbortOptions,
  ): Promise<Result> => {
    if (closed) throw closedError();
    return operationGuard.execute(operation, operationOptions);
  };

  const getExistingOrNewConnection = () => {
    if (!connectionPromise) {
      connectionPromise ??= Promise.resolve(getConnection());
    }
    return connectionPromise;
  };

  const innerTransactionFactory = transactionFactoryWithAsyncAmbientConnection(
    options.driverType,
    getExistingOrNewConnection,
    options.closeConnection,
  );

  const result: ConnectionPool<ConnectionType> = {
    driverType,
    connection: (connectionOptions) =>
      executeIfOpen(
        () =>
          getExistingOrNewConnection().then((conn) =>
            wrapPooledConnection(conn, () => Promise.resolve()),
          ),
        connectionOptions,
      ),
    execute: (() => {
      const ambientExecutor = sqlExecutorInAmbientConnection({
        driverType,
        connection: getExistingOrNewConnection,
      });

      return {
        query: (sql, opts) =>
          executeIfOpen(() => ambientExecutor.query(sql, opts), opts),
        batchQuery: (sqls, opts) =>
          executeIfOpen(() => ambientExecutor.batchQuery(sqls, opts), opts),
        command: (sql, opts) =>
          executeIfOpen(() => ambientExecutor.command(sql, opts), opts),
        batchCommand: (sqls, opts) =>
          executeIfOpen(() => ambientExecutor.batchCommand(sqls, opts), opts),
      };
    })(),
    withConnection: <Result>(
      handle: (
        connection: ConnectionType,
        context: { abort: Abort },
      ) => Promise<Result>,
      options?: WithConnectionOptions,
    ) =>
      executeIfOpen(
        (context) =>
          executeInAmbientConnection<ConnectionType, Result>(
            (connection) => handle(connection, context),
            {
              connection: getExistingOrNewConnection,
              ...options,
            },
          ),
        options,
      ),
    transaction: (transactionOptions) => {
      if (closed) throw closedError();
      return innerTransactionFactory.transaction(transactionOptions);
    },
    withTransaction: (handle, transactionOptions) =>
      executeIfOpen(
        (context) =>
          innerTransactionFactory.withTransaction(
            (tx) => handle(tx, context),
            transactionOptions,
          ),
        transactionOptions,
      ),
    close: async (closeOptions) => {
      if (closed) return;
      closed = true;
      await operationGuard.stop(closeOptions);

      if (!connectionPromise) return;
      const connection = await connectionPromise;
      connectionPromise = null;
      await connection.close();
    },
  };

  return result;
};

export type CreateBoundedConnectionPoolOptions<
  ConnectionType extends AnyConnection,
> = {
  driverType: ConnectionType['driverType'];
  getConnection: () => ConnectionType | Promise<ConnectionType>;
  maxConnections: number;
};

export const createBoundedConnectionPool = <
  ConnectionType extends AnyConnection,
>(
  options: CreateBoundedConnectionPoolOptions<ConnectionType>,
): ConnectionPool<ConnectionType> => {
  const { driverType, maxConnections } = options;

  const guardMaxConnections = guardBoundedAccess(options.getConnection, {
    maxResources: maxConnections,
    reuseResources: true,
    closeResource: (connection) => connection.close(),
  });

  let closed = false;

  const closedError = () =>
    new Error('Bounded connection pool has been closed');

  const ensureOpen = () => {
    if (closed) throw closedError();
  };

  const executeWithPooledConnection = async <Result>(
    operation: (
      conn: ConnectionType,
      context: { abort: Abort },
    ) => Promise<Result>,
    operationOptions?: AbortOptions,
  ): Promise<Result> => {
    ensureOpen();
    return guardMaxConnections.execute(operation, operationOptions);
  };

  return {
    driverType,
    connection: async (connectionOptions) => {
      ensureOpen();
      const conn = await guardMaxConnections.acquire(connectionOptions);
      return wrapPooledConnection(conn, () =>
        Promise.resolve(guardMaxConnections.release(conn)),
      );
    },
    execute: {
      query: (sql, opts) =>
        executeWithPooledConnection((c) => c.execute.query(sql, opts), opts),
      batchQuery: (sqls, opts) =>
        executeWithPooledConnection(
          (c) => c.execute.batchQuery(sqls, opts),
          opts,
        ),
      command: (sql, opts) =>
        executeWithPooledConnection((c) => c.execute.command(sql, opts), opts),
      batchCommand: (sqls, opts) =>
        executeWithPooledConnection(
          (c) => c.execute.batchCommand(sqls, opts),
          opts,
        ),
    },
    withConnection: executeWithPooledConnection,
    transaction: (transactionOptions) => {
      ensureOpen();
      return transactionFactoryWithAsyncAmbientConnection(
        driverType,
        () => guardMaxConnections.acquire(transactionOptions),
        guardMaxConnections.release,
      ).transaction(transactionOptions);
    },
    withTransaction: (handle, transactionOptions) =>
      executeWithPooledConnection((conn, context) => {
        const withTx =
          conn.withTransaction as WithDatabaseTransactionFactory<ConnectionType>['withTransaction'];
        return withTx((tx) => handle(tx, context), transactionOptions);
      }, transactionOptions),
    close: async (closeOptions) => {
      if (closed) return;
      closed = true;
      await guardMaxConnections.stop(closeOptions);
    },
  };
};

export type SingletonClientConnectionPoolOptions<
  ConnectionType extends AnyConnection,
> = {
  driverType: ConnectionType['driverType'];
  dbClient: InferDbClientFromConnection<ConnectionType>;
  connectionFactory: (options: {
    dbClient: InferDbClientFromConnection<ConnectionType>;
  }) => ConnectionType;
};

export const createSingletonClientConnectionPool = <
  ConnectionType extends AnyConnection,
>(
  options: SingletonClientConnectionPoolOptions<ConnectionType>,
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
      : <Result>(
          handle: (
            connection: ConnectionType,
            context: { abort: Abort },
          ) => Promise<Result>,
          options?: WithConnectionOptions,
        ) =>
          executeInNewConnection<ConnectionType, Result>(
            (connection) => handle(connection, { abort: Abort.from(options) }),
            {
              connection,
              ...options,
            },
          );

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
