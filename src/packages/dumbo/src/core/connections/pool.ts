import { createDeferredConnection } from '../connections';
import { type DatabaseDriverType } from '../drivers';
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
    DatabaseTransactionFactory<ConnectionType['driverType']> {
  driverType: ConnectionType['driverType'];
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
  pool: Pick<ConnectionPool<ConnectionType>, 'driverType'> &
    Partial<ConnectionPool<ConnectionType>> & {
      getConnection: () => ConnectionType;
    },
): ConnectionPoolType => {
  const { driverType, getConnection } = pool;

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

  return result as ConnectionPoolType;
};

export const createDeferredConnectionPool = <
  DriverType extends DatabaseDriverType,
  ConnectionType extends Connection<DriverType> = Connection<DriverType>,
>(
  driverType: DriverType,
  importPool: () => Promise<ConnectionPool<Connection<DriverType>>>,
): ConnectionPool<ConnectionType> => {
  let poolPromise: Promise<ConnectionPool<Connection<DriverType>>> | null =
    null;

  const getPool = async (): Promise<ConnectionPool<Connection<DriverType>>> => {
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
    driverType,
    execute: createDeferredExecutor(driverType, async () => {
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
      createDeferredConnection(driverType, async () =>
        (await getPool()).connection(),
      ),
  });
};
