import type { WithSQLExecutor } from '../execute';
import { type Connection } from './connection';
import type { DatabaseTransactionFactory } from './transaction';

export interface ConnectionPool<ConnectionType extends Connection = Connection>
  extends WithSQLExecutor,
    DatabaseTransactionFactory<ConnectionType['type']> {
  type: ConnectionType['type'];
  open: () => Promise<ConnectionType>;
  close: () => Promise<void>;
}

export type ConnectionPoolProvider<
  ConnectionPoolType extends ConnectionPool = ConnectionPool,
  ConnectionPoolOptions = unknown,
> = (options: ConnectionPoolOptions) => ConnectionPoolType;
