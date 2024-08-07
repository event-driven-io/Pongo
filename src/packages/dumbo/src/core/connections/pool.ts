import {
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
    DatabaseTransactionFactory<ConnectionType['type']> {
  type: ConnectionType['type'];
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
  pool: Pick<ConnectionPool<ConnectionType>, 'type'> &
    Partial<ConnectionPool<ConnectionType>> & {
      getConnection: () => ConnectionType;
    },
): ConnectionPoolType => {
  const { type, getConnection } = pool;

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
    type,
    connection,
    withConnection,
    close,
    execute,
    ...transaction,
  };

  return result as ConnectionPoolType;
};
