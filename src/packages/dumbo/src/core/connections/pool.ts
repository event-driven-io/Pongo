import { sqlExecutorInNewConnection, type WithSQLExecutor } from '../execute';
import { type Connection } from './connection';
import {
  transactionFactoryWithNewConnection,
  type DatabaseTransactionFactory,
} from './transaction';

export interface ConnectionPool<ConnectionType extends Connection = Connection>
  extends WithSQLExecutor,
    DatabaseTransactionFactory<ConnectionType['type']> {
  type: ConnectionType['type'];
  open: () => Promise<ConnectionType>;
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

  const open =
    'open' in pool ? pool.open : () => Promise.resolve(getConnection());

  const close = 'close' in pool ? pool.close : () => Promise.resolve();

  const execute =
    'execute' in pool ? pool.execute : sqlExecutorInNewConnection({ open });

  const transaction =
    'transaction' in pool && 'withTransaction' in pool
      ? {
          transaction: pool.transaction,
          withTransaction: pool.withTransaction,
        }
      : transactionFactoryWithNewConnection(getConnection);

  const result: ConnectionPool<ConnectionType> = {
    type,
    open,
    close,
    execute,
    ...transaction,
  };

  return result as ConnectionPoolType;
};
