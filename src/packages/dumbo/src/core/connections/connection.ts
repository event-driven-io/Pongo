import { type DatabaseDriverType } from '../drivers';
import {
  sqlExecutor,
  type DbSQLExecutor,
  type DbSQLExecutorOptions,
  type WithSQLExecutor,
} from '../execute';
import type { JSONSerializer } from '../serializer';
import {
  transactionFactoryWithDbClient,
  type AnyDatabaseTransaction,
  type DatabaseTransaction,
  type DatabaseTransactionOptions,
  type WithDatabaseTransactionFactory,
} from './transaction';

export interface Connection<
  Self extends AnyConnection = AnyConnection,
  DriverType extends DatabaseDriverType = DatabaseDriverType,
  DbClient = unknown,
  TransactionType extends DatabaseTransaction<Self> = DatabaseTransaction<Self>,
  TransactionOptionsType extends
    DatabaseTransactionOptions = DatabaseTransactionOptions,
> extends WithSQLExecutor,
    WithDatabaseTransactionFactory<
      Self,
      TransactionType,
      TransactionOptionsType
    > {
  driverType: DriverType;
  open: () => Promise<DbClient>;
  close: () => Promise<void>;
}

export type AnyConnection = Connection<
  AnyConnection,
  DatabaseDriverType,
  unknown,
  AnyDatabaseTransaction,
  DatabaseTransactionOptions
>;

export type InferDriverTypeFromConnection<C extends AnyConnection> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  C extends Connection<any, infer DT, any, any, any> ? DT : never;

export type InferDbClientFromConnection<C extends AnyConnection> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  C extends Connection<any, any, infer DC, any, any> ? DC : never;

export type InferTransactionFromConnection<C extends AnyConnection> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  C extends Connection<any, any, any, infer DT, any> ? DT : never;

export type InferTransactionOptionsFromConnection<C extends AnyConnection> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  C extends Connection<any, any, any, any, infer TO> ? TO : never;

export type ConnectionOptions<
  ConnectionType extends AnyConnection = AnyConnection,
> = {
  driverType?: ConnectionType['driverType'];
  transactionOptions?: InferTransactionOptionsFromConnection<ConnectionType>;
};

export type ConnectionFactory<
  ConnectionType extends AnyConnection = AnyConnection,
> = (options: ConnectionOptions<ConnectionType>) => ConnectionType;

export interface WithConnectionFactory<
  ConnectionType extends AnyConnection = AnyConnection,
> {
  connection: () => Promise<ConnectionType>;

  withConnection: <Result = unknown>(
    handle: (connection: ConnectionType) => Promise<Result>,
  ) => Promise<Result>;
}

export type InitTransaction<
  ConnectionType extends AnyConnection = AnyConnection,
  TreansactionType extends
    DatabaseTransaction<ConnectionType> = DatabaseTransaction<ConnectionType>,
  TransactionOptionsType extends
    DatabaseTransactionOptions = DatabaseTransactionOptions,
> = (connection: () => ConnectionType) => (
  client: Promise<InferDbClientFromConnection<ConnectionType>>,
  options?: TransactionOptionsType & {
    close: (
      client: InferDbClientFromConnection<ConnectionType>,
      error?: unknown,
    ) => Promise<void>;
  },
) => TreansactionType;

export type CreateConnectionOptions<
  ConnectionType extends AnyConnection = AnyConnection,
  Executor extends DbSQLExecutor = DbSQLExecutor,
  TransactionType extends
    DatabaseTransaction<ConnectionType> = DatabaseTransaction<ConnectionType>,
  TransactionOptionsType extends
    DatabaseTransactionOptions = DatabaseTransactionOptions,
> = {
  driverType: InferDriverTypeFromConnection<ConnectionType>;
  connect: () => Promise<InferDbClientFromConnection<ConnectionType>>;
  close: (client: InferDbClientFromConnection<ConnectionType>) => Promise<void>;
  initTransaction: InitTransaction<
    ConnectionType,
    TransactionType,
    TransactionOptionsType
  >;
  serializer: JSONSerializer;
  executor: (options: DbSQLExecutorOptions) => Executor;
};

export type CreateAmbientConnectionOptions<
  ConnectionType extends AnyConnection = AnyConnection,
  Executor extends DbSQLExecutor = DbSQLExecutor,
  TransactionType extends
    DatabaseTransaction<ConnectionType> = DatabaseTransaction<ConnectionType>,
  TransactionOptionsType extends
    DatabaseTransactionOptions = DatabaseTransactionOptions,
> = {
  driverType: InferDriverTypeFromConnection<ConnectionType>;
  client: InferDbClientFromConnection<ConnectionType>;
  serializer: JSONSerializer;
  initTransaction: InitTransaction<
    ConnectionType,
    TransactionType,
    TransactionOptionsType
  >;
  executor: (options: DbSQLExecutorOptions) => Executor;
};

export const createAmbientConnection = <
  ConnectionType extends AnyConnection = AnyConnection,
  Executor extends DbSQLExecutor = DbSQLExecutor,
  TransactionType extends
    DatabaseTransaction<ConnectionType> = DatabaseTransaction<ConnectionType>,
>(
  options: CreateAmbientConnectionOptions<
    ConnectionType,
    Executor,
    TransactionType
  >,
): ConnectionType => {
  const { driverType, client, executor, initTransaction, serializer } = options;

  const clientPromise = Promise.resolve(client);
  const closePromise = Promise.resolve();
  const open = () => clientPromise;
  const close = () => closePromise;

  const connection: Connection<
    ConnectionType,
    InferDriverTypeFromConnection<ConnectionType>,
    InferDbClientFromConnection<ConnectionType>,
    TransactionType
  > = {
    driverType,
    open,
    close,
    ...transactionFactoryWithDbClient<ConnectionType, TransactionType>(
      open,
      initTransaction(() => typedConnection),
    ),
    execute: sqlExecutor(executor({ serializer }), { connect: open }),
  };

  const typedConnection = connection as unknown as ConnectionType;

  return typedConnection;
};

export type CreateSingletonConnectionOptions<
  ConnectionType extends AnyConnection = AnyConnection,
  Executor extends DbSQLExecutor = DbSQLExecutor,
  TransactionType extends
    DatabaseTransaction<ConnectionType> = DatabaseTransaction<ConnectionType>,
  TransactionOptionsType extends
    DatabaseTransactionOptions = DatabaseTransactionOptions,
> = {
  driverType: InferDriverTypeFromConnection<ConnectionType>;
  connect: () => Promise<InferDbClientFromConnection<ConnectionType>>;
  close: (client: InferDbClientFromConnection<ConnectionType>) => Promise<void>;
  initTransaction: InitTransaction<
    ConnectionType,
    TransactionType,
    TransactionOptionsType
  >;
  serializer: JSONSerializer;
  executor: (options: DbSQLExecutorOptions) => Executor;
};

export const createSingletonConnection = <
  ConnectionType extends AnyConnection = AnyConnection,
  Executor extends DbSQLExecutor = DbSQLExecutor,
  TransactionType extends
    DatabaseTransaction<ConnectionType> = DatabaseTransaction<ConnectionType>,
>(
  options: CreateSingletonConnectionOptions<
    ConnectionType,
    Executor,
    TransactionType
  >,
): ConnectionType => {
  const { driverType, connect, close, initTransaction, executor, serializer } =
    options;

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
    execute: sqlExecutor(executor({ serializer }), { connect: getClient }),
  };

  const typedConnection = connection as unknown as ConnectionType;

  return typedConnection;
};

export type CreateTransientConnectionOptions<
  ConnectionType extends AnyConnection = AnyConnection,
  Executor extends DbSQLExecutor = DbSQLExecutor,
  TransactionType extends
    DatabaseTransaction<ConnectionType> = DatabaseTransaction<ConnectionType>,
  TransactionOptionsType extends
    DatabaseTransactionOptions = DatabaseTransactionOptions,
> = {
  driverType: InferDriverTypeFromConnection<ConnectionType>;
  open: () => Promise<InferDbClientFromConnection<ConnectionType>>;
  close: () => Promise<void>;
  initTransaction: InitTransaction<
    ConnectionType,
    TransactionType,
    TransactionOptionsType
  >;
  serializer: JSONSerializer;
  executor: (options: DbSQLExecutorOptions) => Executor;
};

export const createTransientConnection = <
  ConnectionType extends AnyConnection = AnyConnection,
  Executor extends DbSQLExecutor = DbSQLExecutor,
  TransactionType extends
    DatabaseTransaction<ConnectionType> = DatabaseTransaction<ConnectionType>,
>(
  options: CreateTransientConnectionOptions<
    ConnectionType,
    Executor,
    TransactionType
  >,
): ConnectionType => {
  const { driverType, open, close, initTransaction, executor, serializer } =
    options;

  const connection: Connection<
    ConnectionType,
    InferDriverTypeFromConnection<ConnectionType>,
    InferDbClientFromConnection<ConnectionType>,
    DatabaseTransaction<ConnectionType>
  > = {
    driverType,
    open,
    close,
    ...transactionFactoryWithDbClient<ConnectionType>(
      open,
      initTransaction(() => typedConnection),
    ),
    execute: sqlExecutor(executor({ serializer }), { connect: open }),
  };

  const typedConnection = connection as unknown as ConnectionType;

  return typedConnection;
};

export const createConnection = <
  ConnectionType extends AnyConnection = AnyConnection,
  Executor extends DbSQLExecutor = DbSQLExecutor,
  TransactionType extends
    DatabaseTransaction<ConnectionType> = DatabaseTransaction<ConnectionType>,
>(
  options: CreateConnectionOptions<ConnectionType, Executor, TransactionType>,
): ConnectionType => {
  const { driverType, connect, close, initTransaction, executor, serializer } =
    options;

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
    execute: sqlExecutor(executor({ serializer }), { connect: getClient }),
  };

  const typedConnection = connection as unknown as ConnectionType;

  return typedConnection;
};
