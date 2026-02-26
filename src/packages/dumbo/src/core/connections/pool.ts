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
  transactionFactoryWithAmbientConnection,
  transactionFactoryWithNewConnection,
  type DatabaseTransaction,
  type DatabaseTransactionOptions,
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
  getConnection: () => ConnectionType;
  connectionOptions?: never;
};

export const createSingletonConnectionPool = <
  ConnectionType extends AnyConnection,
>(
  options: SingletonConnectionPoolOptions<ConnectionType>,
): ConnectionPool<ConnectionType> => {
  const { driverType, getConnection } = options;
  let connection: ConnectionType | null = null;

  const getExistingOrNewConnection = () =>
    connection ?? (connection = getConnection());

  const getExistingOrNewConnectionAsync = () =>
    Promise.resolve(getExistingOrNewConnection());

  const result: ConnectionPool<ConnectionType> = {
    driverType,
    connection: () =>
      getExistingOrNewConnectionAsync().then((conn) =>
        wrapPooledConnection(conn, () => Promise.resolve()),
      ),
    execute: sqlExecutorInAmbientConnection({
      driverType,
      connection: getExistingOrNewConnectionAsync,
    }),
    withConnection: <Result>(
      handle: (connection: ConnectionType) => Promise<Result>,
      _options?: WithConnectionOptions,
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
  const { driverType, getConnection, maxConnections } = options;
  const pool: ConnectionType[] = [];

  const taskProcessor = new TaskProcessor({
    maxActiveTasks: maxConnections,
    maxQueueSize: 1000,
  });

  const acquire = async (): Promise<ConnectionType> => {
    return taskProcessor.enqueue(async ({ ack }) => {
      let conn: ConnectionType | undefined = pool.pop();
      if (!conn) {
        conn = await getConnection();
      }
      ack();
      return conn;
    });
  };

  const release = (conn: ConnectionType) => {
    pool.push(conn);
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

  const result: ConnectionPool<ConnectionType> = {
    driverType,
    connection: async () => {
      const conn = await acquire();
      return wrapPooledConnection(conn, () => {
        release(conn);
        return Promise.resolve();
      });
    },
    execute: {
      query: (sql, options) =>
        executeWithPooling((conn) => conn.execute.query(sql, options)),
      batchQuery: (sqls, options) =>
        executeWithPooling((conn) => conn.execute.batchQuery(sqls, options)),
      command: (sql, options) =>
        executeWithPooling((conn) => conn.execute.command(sql, options)),
      batchCommand: (sqls, options) =>
        executeWithPooling((conn) => conn.execute.batchCommand(sqls, options)),
    },
    withConnection: executeWithPooling,
    transaction: (options) => {
      let conn: ConnectionType | null = null;
      let innerTx: DatabaseTransaction<ConnectionType> | null = null;

      const ensureConnection = async () => {
        if (!conn) {
          conn = await acquire();
          innerTx = conn.transaction(options);
        }
        return innerTx!;
      };

      const tx: DatabaseTransaction<ConnectionType> = {
        driverType,
        get connection() {
          if (!conn) {
            throw new Error('Transaction not started - call begin() first');
          }
          return conn;
        },
        execute: {
          query: async (sql, queryOptions) => {
            const tx = await ensureConnection();
            return tx.execute.query(sql, queryOptions);
          },
          batchQuery: async (sqls, queryOptions) => {
            const tx = await ensureConnection();
            return tx.execute.batchQuery(sqls, queryOptions);
          },
          command: async (sql, commandOptions) => {
            const tx = await ensureConnection();
            return tx.execute.command(sql, commandOptions);
          },
          batchCommand: async (sqls, commandOptions) => {
            const tx = await ensureConnection();
            return tx.execute.batchCommand(sqls, commandOptions);
          },
        },
        begin: async () => {
          const tx = await ensureConnection();
          return tx.begin();
        },
        commit: async () => {
          if (!innerTx) {
            throw new Error('Transaction not started');
          }
          try {
            return await innerTx.commit();
          } finally {
            if (conn) release(conn);
          }
        },
        rollback: async (error?: unknown) => {
          if (!innerTx) {
            if (conn) release(conn);
            return;
          }
          try {
            return await innerTx.rollback(error);
          } finally {
            if (conn) release(conn);
          }
        },
        _transactionOptions: undefined as unknown as DatabaseTransactionOptions,
      };

      return tx as InferTransactionFromConnection<ConnectionType>;
    },
    withTransaction: async (handle, options) => {
      const conn = await acquire();
      try {
        const withTx =
          conn.withTransaction as WithDatabaseTransactionFactory<ConnectionType>['withTransaction'];
        return await withTx(handle, options);
      } finally {
        release(conn);
      }
    },
    close: async () => {
      const connections = [...pool];
      pool.length = 0;
      await Promise.all(connections.map((conn) => conn.close()));
      await taskProcessor.waitForEndOfProcessing();
    },
  };

  return result;
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
