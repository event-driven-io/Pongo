import { AsyncLocalStorage } from 'node:async_hooks';
import { TaskProcessor } from '../../../core/taskProcessing';
import type { SQLitePool } from '../core';
import type { SQLite3Connection } from './connections';

export const serializeSqlite3WriterPool = (
  pool: SQLitePool<SQLite3Connection>,
  options?: { maxQueueSize?: number },
): SQLitePool<SQLite3Connection> => {
  const taskProcessor = new TaskProcessor({
    maxActiveTasks: 1,
    maxQueueSize: options?.maxQueueSize ?? 1000,
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
    driverType: pool.driverType,
    connection: pool.connection.bind(pool),
    transaction: pool.transaction.bind(pool),
    withConnection: (handle, connectionOptions) =>
      connectionOptions?.readonly
        ? pool.withConnection(handle, connectionOptions)
        : enqueue(() => pool.withConnection(handle, connectionOptions)),
    withTransaction: (handle, transactionOptions) =>
      enqueue(() => pool.withTransaction(handle, transactionOptions)),
    execute: {
      query: pool.execute.query.bind(pool.execute),
      batchQuery: pool.execute.batchQuery.bind(pool.execute),
      command: (sql, commandOptions) =>
        enqueue(() => pool.execute.command(sql, commandOptions)),
      batchCommand: (sqls, commandOptions) =>
        enqueue(() => pool.execute.batchCommand(sqls, commandOptions)),
    },
    close: async () => {
      await taskProcessor.stop();
      await pool.close();
    },
  };
};
