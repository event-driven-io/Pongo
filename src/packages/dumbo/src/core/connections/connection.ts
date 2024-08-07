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
  ConnectorType extends string = string,
  DbClient = unknown,
> {
  connection: () => Connection<ConnectorType, DbClient>;

  withConnection: <Result = unknown>(
    handle: (
      connection: Connection<ConnectorType, DbClient>,
    ) => Promise<Result>,
  ) => Promise<Result>;
}
