import { createDeferredConnection } from '../connections';
import type { ConnectorType } from '../connectors';
import {
  createDeferredExecutor,
  executeInNewConnection,
  sqlExecutorInNewConnection,
  type WithSQLExecutor,
} from '../execute';
import { type Connection, type ConnectionFactory } from './connection';
import {
  transactionFactoryWithNewConnection,
  type DatabaseTransactionFactory,
} from './transaction';

export interface ConnectionPool<ConnectionType extends Connection = Connection>
  extends WithSQLExecutor,
    ConnectionFactory<ConnectionType>,
    DatabaseTransactionFactory<ConnectionType['connector']> {
  connector: ConnectionType['connector'];
  close: () => Promise<void>;
}

export type ConnectionPoolFactory<
  ConnectionPoolType extends ConnectionPool = ConnectionPool,
  ConnectionPoolOptions = unknown,
> = (options: ConnectionPoolOptions) => ConnectionPoolType;

export const createConnectionPool = <
  ConnectionType extends Connection,
  ConnectionPoolType extends ConnectionPool<ConnectionType>,
>(
  pool: Pick<ConnectionPool<ConnectionType>, 'connector'> &
    Partial<ConnectionPool<ConnectionType>> & {
      getConnection: () => ConnectionType;
    },
): ConnectionPoolType => {
  const { connector, getConnection } = pool;

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
      : sqlExecutorInNewConnection({ connection });

  const transaction =
    'transaction' in pool && 'withTransaction' in pool
      ? {
          transaction: pool.transaction,
          withTransaction: pool.withTransaction,
        }
      : transactionFactoryWithNewConnection(getConnection);

  const result: ConnectionPool<ConnectionType> = {
    connector,
    connection,
    withConnection,
    close,
    execute,
    ...transaction,
  };

  return result as ConnectionPoolType;
};

export const createDeferredConnectionPool = <Connector extends ConnectorType>(
  connector: Connector,
  importPool: () => Promise<ConnectionPool<Connection<Connector>>>,
): ConnectionPool<Connection<Connector>> => {
  let poolPromise: Promise<ConnectionPool<Connection<Connector>>> | null = null;

  const getPool = async (): Promise<ConnectionPool<Connection<Connector>>> => {
    if (poolPromise) return poolPromise;
    try {
      return (poolPromise = importPool());
    } catch (error) {
      throw new Error(
        `Failed to import connection pool: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  return createConnectionPool({
    connector,
    execute: createDeferredExecutor(async () => {
      const connection = await getPool();
      return connection.execute;
    }),
    close: async () => {
      if (!poolPromise) return;
      const pool = await poolPromise;
      await pool.close();
      poolPromise = null;
    },
    getConnection: () =>
      createDeferredConnection(connector, async () =>
        (await getPool()).connection(),
      ),
  });
};
