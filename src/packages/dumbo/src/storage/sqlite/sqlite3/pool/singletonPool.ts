import { AsyncLocalStorage } from 'node:async_hooks';
import {
  createSingletonConnectionPool,
  type ConnectionPool,
} from '../../../../core';
import { TaskProcessor } from '../../../../core/taskProcessing';
import type { AnySQLiteConnection } from '../../core';

export type SQLite3SingletonPoolOptions<
  SQLiteConnectionType extends AnySQLiteConnection,
> = {
  driverType: SQLiteConnectionType['driverType'];
  getConnection: () => SQLiteConnectionType | Promise<SQLiteConnectionType>;
  closeConnection?: (connection: SQLiteConnectionType) => void | Promise<void>;
  maxQueueSize?: number;
};

// Creates a singleton-connection pool whose callers serialise through a
// single-slot TaskProcessor. An AsyncLocalStorage flag lets re-entrant calls
// (made from inside an active task on this pool) bypass the queue instead of
// deadlocking — that's the path emmett relies on when a workflow handler
// internally calls back through the same pool (e.g. messageStore.appendToStream).
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

  const taskProcessor = new TaskProcessor({
    maxActiveTasks: 1,
    maxQueueSize: options.maxQueueSize ?? 1000,
  });
  const insideWriterTask = new AsyncLocalStorage<true>();

  const enqueue = <Result>(op: () => Promise<Result>): Promise<Result> => {
    if (insideWriterTask.getStore() === true) {
      return op();
    }
    return taskProcessor.enqueue(({ ack }) =>
      insideWriterTask.run(true, async () => {
        try {
          return await op();
        } finally {
          ack();
        }
      }),
    );
  };

  return {
    driverType: inner.driverType,
    connection: inner.connection.bind(inner),
    transaction: inner.transaction.bind(inner),
    withConnection: (handle, connectionOptions) =>
      enqueue(() => inner.withConnection(handle, connectionOptions)),
    withTransaction: (handle, transactionOptions) =>
      enqueue(() => inner.withTransaction(handle, transactionOptions)),
    execute: {
      query: (sql, queryOptions) =>
        enqueue(() => inner.execute.query(sql, queryOptions)),
      batchQuery: (sqls, queryOptions) =>
        enqueue(() => inner.execute.batchQuery(sqls, queryOptions)),
      command: (sql, commandOptions) =>
        enqueue(() => inner.execute.command(sql, commandOptions)),
      batchCommand: (sqls, commandOptions) =>
        enqueue(() => inner.execute.batchCommand(sqls, commandOptions)),
    },
    close: async () => {
      await taskProcessor.stop();
      await inner.close();
    },
  };
};
