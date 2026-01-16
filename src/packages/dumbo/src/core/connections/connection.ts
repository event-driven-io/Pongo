import { type DatabaseDriverType } from '../drivers';
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
  DriverType extends DatabaseDriverType = DatabaseDriverType,
  DbClient = unknown,
> extends WithSQLExecutor,
    DatabaseTransactionFactory<DriverType, DbClient> {
  driverType: DriverType;
  open: () => Promise<DbClient>;
  close: () => Promise<void>;
}

export type AnyConnection = Connection<DatabaseDriverType, unknown>;

export type InferConnectionDriverType<C extends AnyConnection> =
  C extends Connection<infer DT, unknown> ? DT : never;

export type InferConnectionDbClient<C extends AnyConnection> =
  C extends Connection<DatabaseDriverType, infer DC> ? DC : never;

export interface ConnectionFactory<
  ConnectionType extends Connection = Connection,
> {
  connection: () => Promise<ConnectionType>;

  withConnection: <Result = unknown>(
    handle: (connection: ConnectionType) => Promise<Result>,
  ) => Promise<Result>;
}

export type InitTransaction<
  DriverType extends DatabaseDriverType = DatabaseDriverType,
  DbClient = unknown,
  ConnectionType extends Connection<DriverType, DbClient> = Connection<
    DriverType,
    DbClient
  >,
> = (
  connection: () => ConnectionType,
) => (
  client: Promise<DbClient>,
  options?: { close: (client: DbClient, error?: unknown) => Promise<void> },
) => DatabaseTransaction<DriverType, DbClient>;

export type CreateConnectionOptions<
  DriverType extends DatabaseDriverType = DatabaseDriverType,
  DbClient = unknown,
  ConnectionType extends Connection<DriverType, DbClient> = Connection<
    DriverType,
    DbClient
  >,
  Executor extends DbSQLExecutor = DbSQLExecutor,
> = {
  driverType: DriverType;
  connect: () => Promise<DbClient>;
  close: (client: DbClient) => Promise<void>;
  initTransaction: InitTransaction<DriverType, DbClient, ConnectionType>;
  executor: () => Executor;
};

export const createConnection = <
  DriverType extends DatabaseDriverType = DatabaseDriverType,
  DbClient = unknown,
  ConnectionType extends Connection<DriverType, DbClient> = Connection<
    DriverType,
    DbClient
  >,
  Executor extends DbSQLExecutor = DbSQLExecutor,
>(
  options: CreateConnectionOptions<
    DriverType,
    DbClient,
    ConnectionType,
    Executor
  >,
): ConnectionType => {
  const { driverType, connect, close, initTransaction, executor } = options;

  let client: DbClient | null = null;
  let connectPromise: Promise<DbClient> | null = null;

  const getClient = async () => {
    if (client) return client;
    if (!connectPromise) {
      connectPromise = connect().then((c) => {
        client = c;
        return c;
      });
    }
    return connectPromise;
  };

  const connection: Connection<DriverType, DbClient> = {
    driverType,
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
