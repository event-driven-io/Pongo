import { DumboError } from '../errors';
import {
  executeInAmbientConnection,
  executeInNewConnection,
  sqlExecutorInAmbientConnection,
  sqlExecutorInNewConnection,
  type WithSQLExecutor,
} from '../execute';
import { TaskProcessor } from '../taskProcessing';
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

export interface ConnectionPool<
  ConnectionType extends AnyConnection = AnyConnection,
>
  extends
    WithSQLExecutor,
    WithConnectionFactory<ConnectionType>,
    WithDatabaseTransactionFactory<ConnectionType> {
  driverType: ConnectionType['driverType'];
  close: () => Promise<void>;
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
    withConnection: (handle, _options?) => handle(connection),
    withTransaction: (handle, options) => {
      const withTx =
        connection.withTransaction as WithDatabaseTransactionFactory<ConnectionType>['withTransaction'];
      return withTx(handle, options);
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

  const getExistingOrNewConnection = () => {
    if (!connectionPromise) {
      connectionPromise ??= Promise.resolve(getConnection());
    }
    return connectionPromise;
  };

  const result: ConnectionPool<ConnectionType> = {
    driverType,
    connection: () =>
      getExistingOrNewConnection().then((conn) =>
        wrapPooledConnection(conn, () => Promise.resolve()),
      ),
    execute: sqlExecutorInAmbientConnection({
      driverType,
      connection: getExistingOrNewConnection,
    }),
    withConnection: <Result>(
      handle: (connection: ConnectionType) => Promise<Result>,
      _options?: WithConnectionOptions,
    ) =>
      executeInAmbientConnection<ConnectionType, Result>(handle, {
        connection: getExistingOrNewConnection,
      }),
    ...transactionFactoryWithAsyncAmbientConnection(
      options.driverType,
      getExistingOrNewConnection,
      options.closeConnection,
    ),
    close: async () => {
      if (!connectionPromise) return;
      const connection = await connectionPromise;
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

const memoizeConnection = <T>(fn: () => T | Promise<T>) => {
  let promise: Promise<T> | null = null;
  return () => {
    if (!promise) {
      promise = Promise.resolve(fn()).catch((err) => {
        promise = null; // Reset so we can try again
        throw err;
      });
    }
    return promise;
  };
};

export const createBoundedConnectionPool = <
  ConnectionType extends AnyConnection,
>(
  options: CreateBoundedConnectionPoolOptions<ConnectionType>,
): ConnectionPool<ConnectionType> => {
  const { driverType, maxConnections } = options;

  const getConnection = memoizeConnection(options.getConnection);

  const pool: ConnectionType[] = [];
  const allConnections = new Set<ConnectionType>();
  const taskProcessor = new TaskProcessor({
    maxActiveTasks: maxConnections,
    maxQueueSize: 1000,
  });

  const ackCallbacks = new Map<ConnectionType, () => void>();
  let closed = false;

  const acquire = async (): Promise<ConnectionType> => {
    if (closed) throw new DumboError('Connection pool is closed');

    return taskProcessor.enqueue(async ({ ack }) => {
      try {
        let conn: ConnectionType | undefined = pool.pop();
        if (!conn) {
          conn = await getConnection();
          allConnections.add(conn);
        }
        ackCallbacks.set(conn, ack);
        return conn;
      } catch (e) {
        ack();
        throw e;
      }
    });
  };

  const release = (conn: ConnectionType) => {
    const ack = ackCallbacks.get(conn);
    if (ack) {
      ackCallbacks.delete(conn);
      pool.push(conn);
      ack();
    }
  };

  const executeWithPooling = async <Result>(
    operation: (conn: ConnectionType) => Promise<Result>,
  ): Promise<Result> => {
    const conn = await acquire();
    try {
      return await operation(conn);
    } finally {
      release(conn);
    }
  };

  return {
    driverType,
    connection: async () => {
      const conn = await acquire();
      return wrapPooledConnection(conn, () => Promise.resolve(release(conn)));
    },
    execute: {
      query: (sql, opts) =>
        executeWithPooling((c) => c.execute.query(sql, opts)),
      batchQuery: (sqls, opts) =>
        executeWithPooling((c) => c.execute.batchQuery(sqls, opts)),
      command: (sql, opts) =>
        executeWithPooling((c) => c.execute.command(sql, opts)),
      batchCommand: (sqls, opts) =>
        executeWithPooling((c) => c.execute.batchCommand(sqls, opts)),
    },
    withConnection: executeWithPooling,
    ...transactionFactoryWithAsyncAmbientConnection(
      driverType,
      acquire,
      release,
    ),
    close: async () => {
      if (closed) return;
      closed = true;

      for (const ack of ackCallbacks.values()) ack();
      ackCallbacks.clear();

      const connections = [...allConnections];
      allConnections.clear();
      pool.length = 0;
      await Promise.all(connections.map((conn) => conn.close()));
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
          handle: (connection: ConnectionType) => Promise<Result>,
          _options?: WithConnectionOptions,
        ) =>
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
