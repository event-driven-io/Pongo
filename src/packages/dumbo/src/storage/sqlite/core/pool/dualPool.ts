import { cpus } from 'os';
import {
  createBoundedConnectionPool,
  createSingletonConnectionPool,
} from '../../../../core';
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

  const getConnectionOptions = (): ConnectionOptions => {
    if (databaseInitPromise !== null) {
      return {
        ...connectionOptions,
        skipDatabasePragmas: true,
      } as ConnectionOptions;
    }
    return connectionOptions as ConnectionOptions;
  };

  const wrappedConnectionFactory = (
    opts: ConnectionOptions,
  ): SQLiteConnectionType => {
    const connection = sqliteConnectionFactory(opts);

    if (!opts.skipDatabasePragmas && databaseInitPromise === null) {
      databaseInitPromise = (async () => {
        await connection.open();
      })();
    }

    return connection;
  };

  const writerPool = createSingletonConnectionPool({
    driverType: options.driverType,
    getConnection: () => wrappedConnectionFactory(getConnectionOptions()),
  });

  const readerPool = createBoundedConnectionPool({
    driverType: options.driverType,
    getConnection: async () => {
      const conn = wrappedConnectionFactory(getConnectionOptions());
      if (databaseInitPromise !== null) {
        await databaseInitPromise;
      }
      return conn;
    },
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
