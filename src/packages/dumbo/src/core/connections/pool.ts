import type { WithSQLExecutor } from '../execute';
import { type Connection } from './connection';
import type { DatabaseTransactionFactory } from './transaction';

export type ConnectionPool<ConnectionType extends Connection = Connection> = {
  type: ConnectionType['type'];
  open: () => Promise<ConnectionType>;
  close: () => Promise<void>;
} & WithSQLExecutor &
  DatabaseTransactionFactory<ConnectionType['type']>;

export type ConnectionPoolProvider<
  ConnectionPoolType extends ConnectionPool = ConnectionPool,
  ConnectionPoolOptions = unknown,
> = (options: ConnectionPoolOptions) => ConnectionPoolType;
