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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyConnection = Connection<any, any, any, any>;

export interface Connection<
  Self extends AnyConnection = AnyConnection,
  DriverType extends DatabaseDriverType = DatabaseDriverType,
  DbClient = unknown,
  TransactionType extends DatabaseTransaction<Self> = DatabaseTransaction<Self>,
> extends WithSQLExecutor,
    DatabaseTransactionFactory<Self, TransactionType> {
  driverType: DriverType;
  open: () => Promise<DbClient>;
  close: () => Promise<void>;
}

export type InferDriverTypeFromConnection<C extends AnyConnection> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  C extends Connection<any, infer DT, any, any> ? DT : never;

export type InferDbClientFromConnection<C extends AnyConnection> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  C extends Connection<any, any, infer DC, any> ? DC : never;

export interface ConnectionFactory<
  ConnectionType extends AnyConnection = AnyConnection,
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
) => DatabaseTransaction<ConnectionType>;

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
    ConnectionType,
    InferDriverTypeFromConnection<ConnectionType>,
    InferDbClientFromConnection<ConnectionType>,
    DatabaseTransaction<ConnectionType>
  > = {
    driverType,
    open: getClient,
    close: () => (client ? close(client) : Promise.resolve()),
    ...transactionFactoryWithDbClient<ConnectionType>(
      getClient,
      initTransaction(() => typedConnection),
    ),
    execute: sqlExecutor(executor(), { connect: getClient }),
  };

  const typedConnection = connection as unknown as ConnectionType;

  return typedConnection;
};
