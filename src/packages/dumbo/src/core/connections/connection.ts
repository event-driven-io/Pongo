import {
  sqlExecutor,
  type DbSQLExecutor,
  type WithSQLExecutor,
} from '../execute';
import {
  transactionFactoryWithDbClient,
  type DatabaseTransaction,
  type DatabaseTransactionFactory,
} from './transaction';

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

export type CreateConnectionOptions<
  ConnectorType extends string = string,
  DbClient = unknown,
  ConnectionType extends Connection<ConnectorType, DbClient> = Connection<
    ConnectorType,
    DbClient
  >,
  Executor extends DbSQLExecutor = DbSQLExecutor,
> = {
  type: ConnectorType;
  connect: Promise<DbClient>;
  close: (client: DbClient) => Promise<void>;
  initTransaction: (
    connection: () => ConnectionType,
  ) => (client: Promise<DbClient>) => DatabaseTransaction<ConnectorType>;
  executor: () => Executor;
};

export const createConnection = <
  ConnectorType extends string = string,
  DbClient = unknown,
  ConnectionType extends Connection<ConnectorType, DbClient> = Connection<
    ConnectorType,
    DbClient
  >,
  Executor extends DbSQLExecutor = DbSQLExecutor,
>(
  options: CreateConnectionOptions<
    ConnectorType,
    DbClient,
    ConnectionType,
    Executor
  >,
): ConnectionType => {
  const { type, connect, close, initTransaction, executor } = options;

  let client: DbClient | null = null;

  const getClient = async () => client ?? (client = await connect);

  const connection: Connection<ConnectorType, DbClient> = {
    type: type,
    open: getClient,
    close: () => (client ? close(client) : Promise.resolve()),
    ...transactionFactoryWithDbClient(
      getClient,
      initTransaction(() => typedConnection),
    ),
    execute: sqlExecutor(executor(), { connect: getClient }),
  };

  const typedConnection = connection as ConnectionType;

  return typedConnection;
};
