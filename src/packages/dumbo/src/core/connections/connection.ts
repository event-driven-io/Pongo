import type { ConnectorType } from '../connectors';
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
  Connector extends ConnectorType = ConnectorType,
  DbClient = unknown,
> extends WithSQLExecutor,
    DatabaseTransactionFactory<Connector, DbClient> {
  connector: Connector;
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
  Connector extends ConnectorType = ConnectorType,
  DbClient = unknown,
  ConnectionType extends Connection<Connector, DbClient> = Connection<
    Connector,
    DbClient
  >,
  Executor extends DbSQLExecutor = DbSQLExecutor,
> = {
  connector: Connector;
  connect: Promise<DbClient>;
  close: (client: DbClient) => Promise<void>;
  initTransaction: (
    connection: () => ConnectionType,
  ) => (client: Promise<DbClient>) => DatabaseTransaction<Connector, DbClient>;
  executor: () => Executor;
};

export const createConnection = <
  Connector extends ConnectorType = ConnectorType,
  DbClient = unknown,
  ConnectionType extends Connection<Connector, DbClient> = Connection<
    Connector,
    DbClient
  >,
  Executor extends DbSQLExecutor = DbSQLExecutor,
>(
  options: CreateConnectionOptions<
    Connector,
    DbClient,
    ConnectionType,
    Executor
  >,
): ConnectionType => {
  const { connector, connect, close, initTransaction, executor } = options;

  let client: DbClient | null = null;

  const getClient = async () => client ?? (client = await connect);

  const connection: Connection<Connector, DbClient> = {
    connector,
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
