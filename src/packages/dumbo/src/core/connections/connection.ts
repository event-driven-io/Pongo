import type { WithSQLExecutor } from '../execute';
import type { TransactionFactory } from './transaction';

export type Connection<
  ConnectorType extends string = string,
  DbClient = unknown,
> = {
  type: ConnectorType;
  connect: () => Promise<DbClient>;
  close: () => Promise<void>;
} & WithSQLExecutor &
  TransactionFactory<ConnectorType>;
