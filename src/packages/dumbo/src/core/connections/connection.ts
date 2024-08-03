import type { WithSQLExecutor } from '../execute';
import type { DatabaseTransactionFactory } from './transaction';

export interface Connection<
  ConnectorType extends string = string,
  DbClient = unknown,
> extends WithSQLExecutor,
    DatabaseTransactionFactory<ConnectorType> {
  type: ConnectorType;
  connect: () => Promise<DbClient>;
  close: () => Promise<void>;
}
