import { type Connection } from './connection';
import type { WithSQLExecutor } from './execute';
import type { TransactionFactory } from './transaction';

export type ConnectionPool<ConnectionType extends Connection = Connection> = {
  type: ConnectionType['type'];
  open: () => Promise<ConnectionType>;
  close: () => Promise<void>;
} & WithSQLExecutor &
  TransactionFactory<ConnectionType['type']>;

export type ConnectionPoolProvider<
  ConnectionPoolType extends ConnectionPool = ConnectionPool,
  ConnectionPoolOptions = unknown,
> = (options: ConnectionPoolOptions) => ConnectionPoolType;
