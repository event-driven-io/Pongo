import type { WithSQLExecutor } from '../execute';
import type { DatabaseTransactionFactory } from './transaction';

export interface Connection<
  ConnectorType extends string = string,
  DbClient = unknown,
> extends WithSQLExecutor,
    DatabaseTransactionFactory<ConnectorType> {
  type: ConnectorType;
  open: () => Promise<DbClient>;
  close: () => Promise<void>;
}

export interface ConnectionFactory<
  ConnectionType extends Connection = Connection,
> {
  connection: () => Promise<ConnectionType>;

  withConnection: <Result = unknown>(
    handle: (connection: ConnectionType) => Promise<Result>,
  ) => Promise<Result>;
}
