import {
  createSingletonConnectionPool,
  type WithDatabaseTransactionFactory,
  type ConnectionPool,
  type InferTransactionFromConnection,
  type InferTransactionOptionsFromConnection,
  type AbortOptions,
  type Abort,
  type PoolCloseOptions,
  type TransactionResult,
} from '../../../../core';
import { guardExclusiveAccess } from '../../../../core/taskProcessing';
import type { AnySQLiteConnection } from '../../core';

export const DEFAULT_SQLITE_MAX_TASK_IDLE_TIME_MS = 30_000;

export type SQLiteActiveTransaction<SQLiteConnectionType> = {
  connection: SQLiteConnectionType;
};

export type SQLiteTransactionContext<SQLiteConnectionType> = {
  current: () => SQLiteActiveTransaction<SQLiteConnectionType> | undefined;
  run: <Result>(
    active: SQLiteActiveTransaction<SQLiteConnectionType>,
    handle: () => Promise<Result>,
  ) => Promise<Result>;
};

export const createSQLiteTransactionContext = <
  SQLiteConnectionType extends AnySQLiteConnection,
>(): SQLiteTransactionContext<SQLiteConnectionType> | undefined => {
  if (typeof process === 'undefined') return undefined;

  const asyncHooks = process.getBuiltinModule?.('node:async_hooks');
  if (!asyncHooks) return undefined;

  const context = new asyncHooks.AsyncLocalStorage<
    SQLiteActiveTransaction<SQLiteConnectionType>
  >();

  return {
    current: () => context.getStore(),
    run: (active, handle) => context.run(active, handle),
  };
};

export type SQLite3SingletonPoolOptions<
  SQLiteConnectionType extends AnySQLiteConnection,
> = {
  driverType: SQLiteConnectionType['driverType'];
  getConnection: () => SQLiteConnectionType | Promise<SQLiteConnectionType>;
  closeConnection?: (connection: SQLiteConnectionType) => void | Promise<void>;
  maxQueueSize?: number;
  maxTaskIdleTime?: number;
  transactionContext?: SQLiteTransactionContext<SQLiteConnectionType>;
};

export const sqlite3SingletonPool = <
  SQLiteConnectionType extends AnySQLiteConnection,
>(
  options: SQLite3SingletonPoolOptions<SQLiteConnectionType>,
): ConnectionPool<SQLiteConnectionType> => {
  const inner = createSingletonConnectionPool<SQLiteConnectionType>({
    driverType: options.driverType,
    getConnection: options.getConnection,
    ...(options.closeConnection
      ? { closeConnection: options.closeConnection }
      : {}),
  });
  const writerGuard = guardExclusiveAccess({
    maxQueueSize: options.maxQueueSize ?? 1000,
    maxTaskIdleTime:
      options.maxTaskIdleTime ?? DEFAULT_SQLITE_MAX_TASK_IDLE_TIME_MS,
  });
  const transactionContext =
    options.transactionContext ?? createSQLiteTransactionContext();

  const activeConnection = (): SQLiteConnectionType | undefined =>
    transactionContext?.current()?.connection;

  const runInTransactionContext = <Result>(
    connection: SQLiteConnectionType,
    operation: () => Promise<Result>,
  ): Promise<Result> =>
    transactionContext
      ? transactionContext.run({ connection }, operation)
      : operation();

  const transactionAwareConnection = (
    connection: SQLiteConnectionType,
  ): SQLiteConnectionType =>
    transactionContext
      ? {
          ...connection,
          withTransaction: (handle, transactionOptions) =>
            runInTransactionContext(connection, () =>
              connection.withTransaction(handle, transactionOptions),
            ),
        }
      : connection;

  const runConnectionTransaction = <Result>(
    connection: SQLiteConnectionType,
    handle: (
      transaction: InferTransactionFromConnection<SQLiteConnectionType>,
      context: { abort: Abort },
    ) => Promise<TransactionResult<Result> | Result>,
    context: { abort: Abort },
    transactionOptions?: InferTransactionOptionsFromConnection<SQLiteConnectionType>,
  ): Promise<Result> => {
    const withTransaction =
      connection.withTransaction as WithDatabaseTransactionFactory<SQLiteConnectionType>['withTransaction'];
    return withTransaction<Result>(
      (transaction) => handle(transaction, context),
      transactionOptions,
    );
  };

  const runOnWriterConnection = <Result>(
    handle: (
      connection: SQLiteConnectionType,
      context: { abort: Abort },
    ) => Promise<Result>,
    options?: AbortOptions,
  ): Promise<Result> => {
    const connection = activeConnection();
    if (connection) {
      return inner.withConnection(
        (_connection, context) => handle(connection, context),
        options,
      );
    }

    return writerGuard.execute(
      (context) =>
        inner.withConnection(
          (connection) => handle(connection, context),
          options,
        ),
      options,
    );
  };

  const withWriterConnection = <Result>(
    handle: (
      connection: SQLiteConnectionType,
      context: { abort: Abort },
    ) => Promise<Result>,
    options?: AbortOptions,
  ): Promise<Result> =>
    runOnWriterConnection(
      (connection, context) =>
        handle(transactionAwareConnection(connection), context),
      options,
    );

  return {
    driverType: inner.driverType,
    connection: inner.connection.bind(inner),
    transaction: inner.transaction.bind(inner),
    withConnection: (handle, connectionOptions) =>
      activeConnection() || !connectionOptions?.readonly
        ? withWriterConnection(handle, connectionOptions)
        : inner.withConnection(handle, connectionOptions),
    withTransaction: (handle, transactionOptions) => {
      const connection = activeConnection();
      if (connection) {
        return inner.withConnection(
          (_connection, context) =>
            runConnectionTransaction(
              connection,
              handle,
              context,
              transactionOptions,
            ),
          transactionOptions,
        );
      }

      return runOnWriterConnection(
        (connection, context) =>
          runInTransactionContext(connection, () =>
            runConnectionTransaction(
              connection,
              handle,
              context,
              transactionOptions,
            ),
          ),
        transactionOptions,
      );
    },
    execute: {
      query: (sql, queryOptions) => {
        const connection = activeConnection();
        return connection
          ? connection.execute.query(sql, queryOptions)
          : inner.execute.query(sql, queryOptions);
      },
      batchQuery: (sqls, queryOptions) => {
        const connection = activeConnection();
        return connection
          ? connection.execute.batchQuery(sqls, queryOptions)
          : inner.execute.batchQuery(sqls, queryOptions);
      },
      command: (sql, commandOptions) =>
        runOnWriterConnection(
          (connection) => connection.execute.command(sql, commandOptions),
          commandOptions,
        ),
      batchCommand: (sqls, commandOptions) =>
        runOnWriterConnection(
          (connection) => connection.execute.batchCommand(sqls, commandOptions),
          commandOptions,
        ),
    },
    close: async (closeOptions?: PoolCloseOptions) => {
      await writerGuard.stop(closeOptions);
      await inner.close(closeOptions);
    },
  };
};
