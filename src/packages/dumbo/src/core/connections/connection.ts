import { type DatabaseDriverType } from '../drivers';
import {
  createDeferredExecutor,
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

export interface ConnectionFactory<
  ConnectionType extends Connection = Connection,
> {
  connection: () => Promise<ConnectionType>;

  withConnection: <Result = unknown>(
    handle: (connection: ConnectionType) => Promise<Result>,
  ) => Promise<Result>;
}

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
  initTransaction: (
    connection: () => ConnectionType,
  ) => (
    client: Promise<DbClient>,
    options?: { close: (client: DbClient, error?: unknown) => Promise<void> },
  ) => DatabaseTransaction<DriverType, DbClient>;
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

export const createDeferredConnection = <DriverType extends DatabaseDriverType>(
  driverType: DriverType,
  importConnection: () => Promise<Connection<DriverType>>,
): Connection<DriverType> => {
  const getConnection = importConnection();

  const execute = createDeferredExecutor(driverType, async () => {
    const conn = await getConnection;
    return conn.execute;
  });

  const connection: Connection<DriverType> = {
    driverType,
    execute,

    open: async (): Promise<unknown> => {
      const conn = await getConnection;
      return conn.open();
    },

    close: async (): Promise<void> => {
      if (getConnection) {
        const conn = await getConnection;
        await conn.close();
      }
    },

    transaction: () => {
      const transaction = getConnection.then((c) => c.transaction());

      return {
        driverType,
        connection,
        execute: createDeferredExecutor(
          driverType,
          async () => (await transaction).execute,
        ),
        begin: async () => (await transaction).begin(),
        commit: async () => (await transaction).commit(),
        rollback: async () => (await transaction).rollback(),
      };
    },
    withTransaction: async (handle) => {
      const connection = await getConnection;
      return connection.withTransaction(handle);
    },
  };

  return connection;
};
