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

export type InferDriverTypeFromConnection<C extends AnyConnection> =
  C extends Connection<infer DT, unknown> ? DT : never;

export type InferDbClientFromConnection<C extends AnyConnection> =
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
  ConnectionType extends AnyConnection = AnyConnection,
> = (connection: () => ConnectionType) => (
  client: Promise<InferDbClientFromConnection<ConnectionType>>,
  options?: {
    close: (
      client: InferDbClientFromConnection<ConnectionType>,
      error?: unknown,
    ) => Promise<void>;
  },
) => DatabaseTransaction<
  InferDriverTypeFromConnection<ConnectionType>,
  InferDbClientFromConnection<ConnectionType>
>;

export type CreateConnectionOptions<
  ConnectionType extends AnyConnection = AnyConnection,
  Executor extends DbSQLExecutor = DbSQLExecutor,
> = {
  driverType: InferDriverTypeFromConnection<ConnectionType>;
  connect: () => Promise<InferDbClientFromConnection<ConnectionType>>;
  close: (client: InferDbClientFromConnection<ConnectionType>) => Promise<void>;
  initTransaction: InitTransaction<ConnectionType>;
  executor: () => Executor;
};

export const createConnection = <
  ConnectionType extends AnyConnection = AnyConnection,
  Executor extends DbSQLExecutor = DbSQLExecutor,
>(
  options: CreateConnectionOptions<ConnectionType, Executor>,
): ConnectionType => {
  const { driverType, connect, close, initTransaction, executor } = options;

  let client: InferDbClientFromConnection<ConnectionType> | null = null;
  let connectPromise: Promise<
    InferDbClientFromConnection<ConnectionType>
  > | null = null;

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

  const connection: Connection<
    InferDriverTypeFromConnection<ConnectionType>,
    InferDbClientFromConnection<ConnectionType>
  > = {
    driverType,
    open: getClient,
    close: () => (client ? close(client) : Promise.resolve()),
    ...transactionFactoryWithDbClient(
      getClient,
      initTransaction(() => typedConnection),
    ),
    execute: sqlExecutor(executor(), { connect: getClient }),
  };

  const typedConnection = connection as unknown as ConnectionType;

  return typedConnection;
};
