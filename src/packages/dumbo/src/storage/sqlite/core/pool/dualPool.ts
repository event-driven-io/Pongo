import { cpus } from 'os';
import {
  createBoundedConnectionPool,
  createSingletonConnectionPool,
} from '../../../../core';
import { TaskProcessor } from '../../../../core/taskProcessing';
import type {
  AnySQLiteConnection,
  SQLiteConnectionFactory,
  SQLiteConnectionOptions,
} from '../connections';
import type { SQLitePool } from './pool';

export type SQLiteDualPoolOptions<
  SQLiteConnectionType extends AnySQLiteConnection,
  ConnectionOptions extends SQLiteConnectionOptions,
> = {
  driverType: SQLiteConnectionType['driverType'];
  dual?: true;
  singleton?: false;
  pooled?: true;
  connection?: never;
  readerPoolSize?: number;
  sqliteConnectionFactory: SQLiteConnectionFactory<
    SQLiteConnectionType,
    ConnectionOptions
  >;
  connectionOptions?: ConnectionOptions;
};

export const sqliteDualConnectionPool = <
  SQLiteConnectionType extends AnySQLiteConnection,
  ConnectionOptions extends SQLiteConnectionOptions,
>(
  options: SQLiteDualPoolOptions<SQLiteConnectionType, ConnectionOptions>,
): SQLitePool<SQLiteConnectionType> => {
  const { sqliteConnectionFactory, connectionOptions } = options;
  const readerPoolSize = options.readerPoolSize ?? Math.max(4, cpus().length);

  let databaseInitPromise: Promise<void> | null = null;

  const initTaskProcessor = new TaskProcessor({
    maxActiveTasks: 1,
    maxQueueSize: 1000,
  });

  const ensureDatabaseInitialized = async (
    connectionOptions: ConnectionOptions | undefined,
    retryCount = 0,
  ): Promise<void> => {
    if (databaseInitPromise !== null) {
      return databaseInitPromise;
    }

    return initTaskProcessor.enqueue(
      async ({ ack }) => {
        if (databaseInitPromise !== null) {
          ack();
          return databaseInitPromise;
        }

        const initConnection = sqliteConnectionFactory({
          ...connectionOptions,
          skipDatabasePragmas: false,
          readonly: false,
        } as ConnectionOptions);

        const initPromise = initConnection.open();
        databaseInitPromise = initPromise;

        try {
          await initPromise;
          await initConnection.close();
          ack();
        } catch (error) {
          databaseInitPromise = null;
          await initConnection.close();
          ack();
          if (retryCount < 3) {
            return ensureDatabaseInitialized(connectionOptions, retryCount + 1);
          }
          throw error;
        }
      },
      { taskGroupId: 'db-init' },
    );
  };

  const wrappedConnectionFactory = async (
    readonly: boolean,
    connectionOptions: ConnectionOptions | undefined,
  ): Promise<SQLiteConnectionType> => {
    await ensureDatabaseInitialized(connectionOptions);

    const connection = sqliteConnectionFactory({
      ...connectionOptions,
      skipDatabasePragmas: true,
      readonly,
    } as ConnectionOptions);

    await connection.open();

    return connection;
  };

  const writerPool = createSingletonConnectionPool({
    driverType: options.driverType,
    getConnection: () => wrappedConnectionFactory(false, connectionOptions),
  });

  const readerPool = createBoundedConnectionPool({
    driverType: options.driverType,
    getConnection: () => wrappedConnectionFactory(true, connectionOptions),
    maxConnections: readerPoolSize,
  });

  return {
    driverType: options.driverType,
    connection: (connectionOptions) =>
      connectionOptions?.readonly
        ? readerPool.connection(connectionOptions)
        : writerPool.connection(connectionOptions),
    execute: {
      query: (...args) => readerPool.execute.query(...args),
      batchQuery: (...args) => readerPool.execute.batchQuery(...args),
      command: (...args) => writerPool.execute.command(...args),
      batchCommand: (...args) => writerPool.execute.batchCommand(...args),
    },
    withConnection: (handle, connectionOptions) =>
      connectionOptions?.readonly
        ? readerPool.withConnection(handle, connectionOptions)
        : writerPool.withConnection(handle, connectionOptions),
    transaction: writerPool.transaction,
    withTransaction: writerPool.withTransaction,
    close: () =>
      Promise.all([writerPool.close(), readerPool.close()]).then(() => {}),
  };
};
