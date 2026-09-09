import type { DatabaseDriverType } from '../drivers';
import {
  sqlExecutor,
  type DbSQLExecutor,
  type DbSQLExecutorOptions,
  type WithSQLExecutor,
} from '../execute';
import type { JSONSerializer } from '../serializer';
import { Abort, type AbortContext, type AbortOptions } from '../taskProcessing';
import type {
  AnyDatabaseTransaction,
  DatabaseTransaction,
  InferTransactionOptionsFromTransaction,
  WithDatabaseTransactionFactory,
} from './transaction';

export interface Connection<
  Self extends AnyConnection = AnyConnection,
  DriverType extends DatabaseDriverType = DatabaseDriverType,
  DbClient = unknown,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TransactionType extends DatabaseTransaction<Self, any> = DatabaseTransaction<
    Self,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >,
>
  extends WithSQLExecutor, WithDatabaseTransactionFactory<Self> {
  driverType: DriverType;
  open: (context?: AbortContext) => Promise<DbClient>;
  close: () => Promise<void>;
  _transactionType: TransactionType;
}

export type AnyConnection = Connection<
  AnyConnection,
  DatabaseDriverType,
  unknown,
  AnyDatabaseTransaction
>;

export type InferDriverTypeFromConnection<C extends AnyConnection> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  C extends Connection<any, infer DT, any, any> ? DT : never;

export type InferDbClientFromConnection<C extends AnyConnection> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  C extends Connection<any, any, infer DC, any> ? DC : never;

export type InferTransactionFromConnection<C extends AnyConnection> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  C extends Connection<any, any, any, infer DT> ? DT : never;

export type InferTransactionOptionsFromConnection<C extends AnyConnection> =
  InferTransactionOptionsFromTransaction<InferTransactionFromConnection<C>>;

export type ConnectionOptions<
  ConnectionType extends AnyConnection = AnyConnection,
> = {
  driverType?: ConnectionType['driverType'];
  transactionOptions?: InferTransactionOptionsFromConnection<ConnectionType>;
};

export type ConnectionFactory<
  ConnectionType extends AnyConnection = AnyConnection,
> = (options: ConnectionOptions<ConnectionType>) => ConnectionType;

export type WithConnectionOptions = AbortOptions & {
  readonly?: boolean;
};

export interface WithConnectionFactory<
  ConnectionType extends AnyConnection = AnyConnection,
> {
  connection: (options?: WithConnectionOptions) => Promise<ConnectionType>;

  withConnection: <Result = unknown>(
    handle: (
      connection: ConnectionType,
      context: AbortContext,
    ) => Promise<Result>,
    options?: WithConnectionOptions,
  ) => Promise<Result>;
}

export type ConnectionTransactionFactory<
  ConnectionType extends AnyConnection = AnyConnection,
> = (
  connect: (
    context?: AbortContext,
  ) => Promise<InferDbClientFromConnection<ConnectionType>>,
  connection: () => ConnectionType,
) => WithDatabaseTransactionFactory<ConnectionType>;

export type CreateConnectionOptions<
  ConnectionType extends AnyConnection = AnyConnection,
  Executor extends DbSQLExecutor = DbSQLExecutor,
> = {
  driverType: InferDriverTypeFromConnection<ConnectionType>;
  connect: (
    context: AbortContext,
  ) => Promise<InferDbClientFromConnection<ConnectionType>>;
  close: (client: InferDbClientFromConnection<ConnectionType>) => Promise<void>;
  transactionFactory: ConnectionTransactionFactory<ConnectionType>;
  serializer: JSONSerializer;
  executor: (options: DbSQLExecutorOptions) => Executor;
};

export type CreateAmbientConnectionOptions<
  ConnectionType extends AnyConnection = AnyConnection,
  Executor extends DbSQLExecutor = DbSQLExecutor,
> = {
  driverType: InferDriverTypeFromConnection<ConnectionType>;
  client: InferDbClientFromConnection<ConnectionType>;
  transactionFactory: ConnectionTransactionFactory<ConnectionType>;
  serializer: JSONSerializer;
  executor: (options: DbSQLExecutorOptions) => Executor;
};

export const createAmbientConnection = <
  ConnectionType extends AnyConnection = AnyConnection,
  Executor extends DbSQLExecutor = DbSQLExecutor,
>(
  options: CreateAmbientConnectionOptions<ConnectionType, Executor>,
): ConnectionType => {
  const { driverType, client, executor, serializer, transactionFactory } =
    options;

  const clientPromise = Promise.resolve(client);
  const closePromise = Promise.resolve();
  const open = (context?: AbortContext) => {
    Abort.throwIfAborted(context);
    return clientPromise;
  };
  const close = () => closePromise;

  const connection: Connection<
    ConnectionType,
    InferDriverTypeFromConnection<ConnectionType>,
    InferDbClientFromConnection<ConnectionType>,
    InferTransactionFromConnection<ConnectionType>
  > = {
    driverType,
    open,
    close,
    ...transactionFactory(open, () => typedConnection),
    execute: sqlExecutor(executor({ serializer }), { connect: open }),
    _transactionType:
      undefined as unknown as InferTransactionFromConnection<ConnectionType>,
  };

  const typedConnection = connection as unknown as ConnectionType;

  return typedConnection;
};

export type CreateSingletonConnectionOptions<
  ConnectionType extends AnyConnection = AnyConnection,
  Executor extends DbSQLExecutor = DbSQLExecutor,
> = {
  driverType: InferDriverTypeFromConnection<ConnectionType>;
  connect: (
    context: AbortContext,
  ) => Promise<InferDbClientFromConnection<ConnectionType>>;
  close: (client: InferDbClientFromConnection<ConnectionType>) => Promise<void>;
  transactionFactory: ConnectionTransactionFactory<ConnectionType>;
  serializer: JSONSerializer;
  executor: (options: DbSQLExecutorOptions) => Executor;
};

export const createSingletonConnection = <
  ConnectionType extends AnyConnection = AnyConnection,
  Executor extends DbSQLExecutor = DbSQLExecutor,
>(
  options: CreateSingletonConnectionOptions<ConnectionType, Executor>,
): ConnectionType => {
  const {
    driverType,
    connect,
    close,
    executor,
    serializer,
    transactionFactory,
  } = options;

  let client: InferDbClientFromConnection<ConnectionType> | null = null;
  let connectPromise: Promise<
    InferDbClientFromConnection<ConnectionType>
  > | null = null;

  const getClient = async (context?: AbortContext) => {
    Abort.throwIfAborted(context);
    if (client) return client;
    if (!connectPromise) {
      connectPromise = connect(context ?? { abort: Abort.never }).then((c) => {
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
    InferTransactionFromConnection<ConnectionType>
  > = {
    driverType,
    open: getClient,
    close: () => (client ? close(client) : Promise.resolve()),
    ...transactionFactory(getClient, () => typedConnection),
    execute: sqlExecutor(executor({ serializer }), { connect: getClient }),
    _transactionType:
      undefined as unknown as InferTransactionFromConnection<ConnectionType>,
  };

  const typedConnection = connection as unknown as ConnectionType;

  return typedConnection;
};

export type CreateTransientConnectionOptions<
  ConnectionType extends AnyConnection = AnyConnection,
  Executor extends DbSQLExecutor = DbSQLExecutor,
> = {
  driverType: InferDriverTypeFromConnection<ConnectionType>;
  open: (
    context?: AbortContext,
  ) => Promise<InferDbClientFromConnection<ConnectionType>>;
  close: () => Promise<void>;
  transactionFactory: ConnectionTransactionFactory<ConnectionType>;
  serializer: JSONSerializer;
  executor: (options: DbSQLExecutorOptions) => Executor;
};

export const createTransientConnection = <
  ConnectionType extends AnyConnection = AnyConnection,
  Executor extends DbSQLExecutor = DbSQLExecutor,
>(
  options: CreateTransientConnectionOptions<ConnectionType, Executor>,
): ConnectionType => {
  const { driverType, open, close, executor, serializer, transactionFactory } =
    options;
  const openIfNotAborted = (context?: AbortContext) => {
    Abort.throwIfAborted(context);
    return open(context);
  };

  const connection: Connection<
    ConnectionType,
    InferDriverTypeFromConnection<ConnectionType>,
    InferDbClientFromConnection<ConnectionType>,
    InferTransactionFromConnection<ConnectionType>
  > = {
    driverType,
    open: openIfNotAborted,
    close,
    ...transactionFactory(openIfNotAborted, () => typedConnection),
    execute: sqlExecutor(executor({ serializer }), {
      connect: openIfNotAborted,
    }),
    _transactionType:
      undefined as unknown as InferTransactionFromConnection<ConnectionType>,
  };

  const typedConnection = connection as unknown as ConnectionType;

  return typedConnection;
};

export const createConnection = <
  ConnectionType extends AnyConnection = AnyConnection,
  Executor extends DbSQLExecutor = DbSQLExecutor,
>(
  options: CreateConnectionOptions<ConnectionType, Executor>,
): ConnectionType => {
  const {
    driverType,
    connect,
    close,
    executor,
    serializer,
    transactionFactory,
  } = options;

  let client: InferDbClientFromConnection<ConnectionType> | null = null;
  let connectPromise: Promise<
    InferDbClientFromConnection<ConnectionType>
  > | null = null;

  const getClient = async (context?: AbortContext) => {
    Abort.throwIfAborted(context);
    if (client) return client;
    if (!connectPromise) {
      connectPromise = connect(context ?? { abort: Abort.never }).then((c) => {
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
    ...transactionFactory(getClient, () => typedConnection),
    execute: sqlExecutor(executor({ serializer }), { connect: getClient }),
    _transactionType:
      undefined as unknown as InferTransactionFromConnection<ConnectionType>,
  };

  const typedConnection = connection as unknown as ConnectionType;

  return typedConnection;
};
