import { DumboError } from '../errors';
import {
  executeInAmbientConnection,
  executeInNewConnection,
  sqlExecutorInAmbientConnection,
  sqlExecutorInNewConnection,
  type WithSQLExecutor,
} from '../execute';
import {
  Guard,
  TaskProcessor,
  type AbortOptions,
  type OperationContext,
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
    withConnection: (handle, _options?) =>
      handle(connection, { signal: ambientNeverAbortSignal }),
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
  closeDeadline?: number;
  signal?: AbortSignal;
  connectionOptions?: never;
};

export const createSingletonConnectionPool = <
  ConnectionType extends AnyConnection,
>(
  options: SingletonConnectionPoolOptions<ConnectionType>,
): ConnectionPool<ConnectionType> => {
  const { driverType, getConnection } = options;

  let connectionPromise: Promise<ConnectionType> | null = null;

  const closedError = () =>
    new DumboError('Singleton connection pool has been closed');

  const processor = new TaskProcessor({
    maxActiveTasks: Number.MAX_SAFE_INTEGER,
    maxQueueSize: Number.MAX_SAFE_INTEGER,
    signal: options.signal,
    stoppedError: closedError,
  });

  const run = <Result>(
    op: (ctx: OperationContext) => Promise<Result>,
    opts?: AbortOptions,
  ): Promise<Result> =>
    processor.enqueue(async ({ ack, signal }) => {
      try {
        return await op({ signal });
      } finally {
        ack();
      }
    }, opts);

  const getExistingOrNewConnection = () => {
    if (!connectionPromise) {
      connectionPromise ??= Promise.resolve(getConnection());
    }
    return connectionPromise;
  };

  const ambientExecutor = sqlExecutorInAmbientConnection({
    driverType,
    connection: getExistingOrNewConnection,
  });

  const innerTransaction = transactionFactoryWithAsyncAmbientConnection(
    options.driverType,
    getExistingOrNewConnection,
    options.closeConnection,
  );

  const result: ConnectionPool<ConnectionType> = {
    driverType,
    connection: (connectionOptions) =>
      run(
        (_ctx) =>
          getExistingOrNewConnection().then((conn) =>
            wrapPooledConnection(conn, () => Promise.resolve()),
          ),
        connectionOptions,
      ),
    execute: {
      query: (sql, opts) =>
        run((_ctx) => ambientExecutor.query(sql, opts), opts),
      batchQuery: (sqls, opts) =>
        run((_ctx) => ambientExecutor.batchQuery(sqls, opts), opts),
      command: (sql, opts) =>
        run((_ctx) => ambientExecutor.command(sql, opts), opts),
      batchCommand: (sqls, opts) =>
        run((_ctx) => ambientExecutor.batchCommand(sqls, opts), opts),
    },
    withConnection: <Result>(
      handle: (
        connection: ConnectionType,
        ctx: OperationContext,
      ) => Promise<Result>,
      withConnectionOpts?: WithConnectionOptions,
    ) =>
      run(
        (ctx) =>
          executeInAmbientConnection<ConnectionType, Result>(
            (conn) => handle(conn, ctx),
            { connection: getExistingOrNewConnection },
          ),
        withConnectionOpts,
      ),
    transaction: (transactionOptions) => {
      if (processor.stopped) throw closedError();
      return innerTransaction.transaction(transactionOptions);
    },
    withTransaction: (handle, transactionOptions) =>
      run(
        (ctx) =>
          innerTransaction.withTransaction(
            (tx) => handle(tx, ctx),
            transactionOptions,
          ),
        transactionOptions,
      ),
    close: async (closeOptions) => {
      if (processor.stopped) return;
      await processor.stop(
        resolveCloseOptions(closeOptions, options.closeDeadline),
      );
      if (!connectionPromise) return;
      const connection = await connectionPromise;
      connectionPromise = null;
      await connection.close();
    },
  };

  return result;
};

const resolveCloseOptions = (
  perCall: PoolCloseOptions | undefined,
  configuredDeadline: number | undefined,
): { force?: boolean; closeDeadline?: number } | undefined => {
  const force = perCall?.force;
  const closeDeadline =
    perCall?.closeDeadline !== undefined
      ? perCall.closeDeadline
      : configuredDeadline;

  if (force === undefined && closeDeadline === undefined) return undefined;
  return {
    ...(force !== undefined ? { force } : {}),
    ...(closeDeadline !== undefined ? { closeDeadline } : {}),
  };
};

// Signal used by pool variants that have no shutdown semantics of their own
// (ambient/caller-managed connections, generic createConnectionPool). User
// handles still receive a real AbortSignal that simply never aborts.
export const ambientNeverAbortSignal: AbortSignal = new AbortController()
  .signal;

export type CreateBoundedConnectionPoolOptions<
  ConnectionType extends AnyConnection,
> = {
  driverType: ConnectionType['driverType'];
  getConnection: () => ConnectionType | Promise<ConnectionType>;
  maxConnections: number;
  closeDeadline?: number;
  signal?: AbortSignal | undefined;
};

export const createBoundedConnectionPool = <
  ConnectionType extends AnyConnection,
>(
  options: CreateBoundedConnectionPoolOptions<ConnectionType>,
): ConnectionPool<ConnectionType> => {
  const { driverType, maxConnections } = options;

  const closedError = () =>
    new DumboError('Bounded connection pool has been closed');

  const guardMaxConnections = Guard.boundedAccess<ConnectionType>(
    options.getConnection,
    {
      maxResources: maxConnections,
      reuseResources: true,
      closeResource: (conn) => conn.close(),
      signal: options.signal,
      stoppedError: closedError,
    },
  );

  const innerTransactionFactory = transactionFactoryWithAsyncAmbientConnection(
    driverType,
    guardMaxConnections.acquire,
    guardMaxConnections.release,
  );

  return {
    driverType,
    connection: async () => {
      const conn = await guardMaxConnections.acquire();
      return wrapPooledConnection(conn, () =>
        Promise.resolve(guardMaxConnections.release(conn)),
      );
    },
    execute: {
      query: (sql, opts) =>
        guardMaxConnections.execute((c) => c.execute.query(sql, opts), opts),
      batchQuery: (sqls, opts) =>
        guardMaxConnections.execute(
          (c) => c.execute.batchQuery(sqls, opts),
          opts,
        ),
      command: (sql, opts) =>
        guardMaxConnections.execute((c) => c.execute.command(sql, opts), opts),
      batchCommand: (sqls, opts) =>
        guardMaxConnections.execute(
          (c) => c.execute.batchCommand(sqls, opts),
          opts,
        ),
    },
    withConnection: (handle, withConnectionOpts) =>
      guardMaxConnections.execute(
        (conn, ctx) => handle(conn, ctx),
        withConnectionOpts,
      ),
    transaction: (transactionOptions) => {
      if (guardMaxConnections.stopped) throw closedError();
      return innerTransactionFactory.transaction(transactionOptions);
    },
    withTransaction: (handle, transactionOptions) =>
      guardMaxConnections.execute((conn, ctx) => {
        const withTx =
          conn.withTransaction as WithDatabaseTransactionFactory<ConnectionType>['withTransaction'];
        return withTx((tx) => handle(tx, ctx), transactionOptions);
      }, transactionOptions),
    close: (closeOptions) =>
      guardMaxConnections.stop(
        resolveCloseOptions(closeOptions, options.closeDeadline),
      ),
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
            ctx: OperationContext,
          ) => Promise<Result>,
          _options?: WithConnectionOptions,
        ) =>
          executeInNewConnection<ConnectionType, Result>(
            (conn) => handle(conn, { signal: ambientNeverAbortSignal }),
            { connection },
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
