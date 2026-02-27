import type { WithSQLExecutor } from '../execute';
import type {
  AnyConnection,
  InferDbClientFromConnection,
  InferTransactionFromConnection,
  InferTransactionOptionsFromConnection,
} from './connection';

export interface DatabaseTransaction<
  ConnectionType extends AnyConnection = AnyConnection,
  TransactionOptionsType extends DatabaseTransactionOptions =
    DatabaseTransactionOptions,
> extends WithSQLExecutor {
  driverType: ConnectionType['driverType'];
  connection: ConnectionType;
  begin: () => Promise<void>;
  commit: () => Promise<void>;
  rollback: (error?: unknown) => Promise<void>;
  _transactionOptions: TransactionOptionsType;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyDatabaseTransaction = DatabaseTransaction<any, any>;

export type DatabaseTransactionOptions = {
  allowNestedTransactions?: boolean;
  readonly?: boolean;
};

export type InferTransactionOptionsFromTransaction<
  C extends AnyDatabaseTransaction,
> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  C extends DatabaseTransaction<any, infer TO> ? TO : never;

export interface WithDatabaseTransactionFactory<
  ConnectionType extends AnyConnection = AnyConnection,
> {
  transaction: (
    options?: InferTransactionOptionsFromConnection<ConnectionType>,
  ) => InferTransactionFromConnection<ConnectionType>;

  withTransaction: <Result = never>(
    handle: (
      transaction: InferTransactionFromConnection<ConnectionType>,
    ) => Promise<TransactionResult<Result> | Result>,
    options?: InferTransactionOptionsFromConnection<ConnectionType>,
  ) => Promise<Result>;
}

export type TransactionResult<Result> = { success: boolean; result: Result };

const toTransactionResult = <Result>(
  transactionResult: TransactionResult<Result> | Result,
): TransactionResult<Result> =>
  transactionResult !== undefined &&
  transactionResult !== null &&
  typeof transactionResult === 'object' &&
  'success' in transactionResult
    ? transactionResult
    : { success: true, result: transactionResult };

export const executeInTransaction = async <
  DatabaseTransactionType extends AnyDatabaseTransaction =
    AnyDatabaseTransaction,
  Result = void,
>(
  transaction: DatabaseTransactionType,
  handle: (
    transaction: DatabaseTransactionType,
  ) => Promise<TransactionResult<Result> | Result>,
): Promise<Result> => {
  await transaction.begin();

  try {
    const { success, result } = toTransactionResult(await handle(transaction));

    if (success) await transaction.commit();
    else await transaction.rollback();

    return result;
  } catch (e) {
    await transaction.rollback();
    throw e;
  }
};

export const transactionFactoryWithDbClient = <
  ConnectionType extends AnyConnection = AnyConnection,
>(
  connect: () => Promise<InferDbClientFromConnection<ConnectionType>>,
  initTransaction: (
    client: Promise<InferDbClientFromConnection<ConnectionType>>,
    options?: InferTransactionOptionsFromConnection<ConnectionType> & {
      close: (
        client: InferDbClientFromConnection<ConnectionType>,
        error?: unknown,
      ) => Promise<void>;
    },
  ) => InferTransactionFromConnection<ConnectionType>,
): WithDatabaseTransactionFactory<ConnectionType> => {
  let currentTransaction:
    | InferTransactionFromConnection<ConnectionType>
    | undefined = undefined;

  const getOrInitCurrentTransaction = (
    options?: InferTransactionOptionsFromConnection<ConnectionType>,
  ) =>
    currentTransaction ??
    (currentTransaction = initTransaction(connect(), {
      close: () => {
        currentTransaction = undefined;
        return Promise.resolve();
      },
      ...(options ??
        ({} as InferTransactionOptionsFromConnection<ConnectionType>)),
    }));

  return {
    transaction: getOrInitCurrentTransaction,
    withTransaction: (handle, options) =>
      executeInTransaction(getOrInitCurrentTransaction(options), handle),
  };
};

const wrapInConnectionClosure = async <
  ConnectionType extends AnyConnection = AnyConnection,
  Result = unknown,
>(
  connection: ConnectionType,
  handle: () => Promise<Result>,
) => {
  try {
    return await handle();
  } finally {
    await connection.close();
  }
};

export const transactionFactoryWithNewConnection = <
  ConnectionType extends AnyConnection = AnyConnection,
>(
  connect: () => ConnectionType,
): WithDatabaseTransactionFactory<ConnectionType> => ({
  transaction: (options) => {
    const connection = connect();
    const transaction = connection.transaction(
      options,
    ) as InferTransactionFromConnection<ConnectionType>;

    return {
      ...transaction,
      commit: () =>
        wrapInConnectionClosure(connection, () => transaction.commit()),
      rollback: () =>
        wrapInConnectionClosure(connection, () => transaction.rollback()),
    };
  },
  withTransaction: (handle, options) => {
    const connection = connect();
    const withTx =
      connection.withTransaction as WithDatabaseTransactionFactory<ConnectionType>['withTransaction'];
    return wrapInConnectionClosure(connection, () => withTx(handle, options));
  },
});

export const transactionFactoryWithAmbientConnection = <
  ConnectionType extends AnyConnection = AnyConnection,
>(
  connect: () => ConnectionType,
): WithDatabaseTransactionFactory<ConnectionType> => ({
  transaction: (options) => {
    const connection = connect();
    const transaction = connection.transaction(options);

    return {
      ...transaction,
      commit: () => transaction.commit(),
      rollback: () => transaction.rollback(),
    } as InferTransactionFromConnection<ConnectionType>;
  },
  withTransaction: (handle, options) => {
    const connection = connect();
    const withTx =
      connection.withTransaction as WithDatabaseTransactionFactory<ConnectionType>['withTransaction'];
    return withTx(handle, options);
  },
});

export const transactionFactoryWithAsyncAmbientConnection = <
  ConnectionType extends AnyConnection = AnyConnection,
>(
  driverType: ConnectionType['driverType'],
  connect: () => Promise<ConnectionType>,
  close?: (connection: ConnectionType) => void | Promise<void>,
): WithDatabaseTransactionFactory<ConnectionType> => {
  close ??= () => Promise.resolve();
  return {
    transaction: (options) => {
      let conn: ConnectionType | null = null;
      let innerTx: DatabaseTransaction<ConnectionType> | null = null;
      let connectingPromise: Promise<void> | null = null;

      const ensureConnection = async () => {
        if (conn) return innerTx!;

        if (!connectingPromise) {
          connectingPromise = (async () => {
            conn = await connect();
            innerTx = conn.transaction(options);
          })();
        }

        await connectingPromise;
        return innerTx!;
      };

      const tx: DatabaseTransaction<ConnectionType> = {
        driverType,
        get connection() {
          if (!conn) {
            throw new Error('Transaction not started - call begin() first');
          }
          return conn;
        },
        execute: {
          query: async (sql, queryOptions) => {
            const tx = await ensureConnection();
            return tx.execute.query(sql, queryOptions);
          },
          batchQuery: async (sqls, queryOptions) => {
            const tx = await ensureConnection();
            return tx.execute.batchQuery(sqls, queryOptions);
          },
          command: async (sql, commandOptions) => {
            const tx = await ensureConnection();
            return tx.execute.command(sql, commandOptions);
          },
          batchCommand: async (sqls, commandOptions) => {
            const tx = await ensureConnection();
            return tx.execute.batchCommand(sqls, commandOptions);
          },
        },
        begin: async () => {
          const tx = await ensureConnection();
          return tx.begin();
        },
        commit: async () => {
          if (!innerTx) {
            throw new Error('Transaction not started');
          }
          try {
            return await innerTx.commit();
          } finally {
            if (conn) await close(conn);
          }
        },
        rollback: async (error?: unknown) => {
          if (!innerTx) {
            if (conn) await close(conn);
            return;
          }
          try {
            return await innerTx.rollback(error);
          } finally {
            if (conn) await close(conn);
          }
        },
        _transactionOptions: undefined as unknown as DatabaseTransactionOptions,
      };

      return tx as InferTransactionFromConnection<ConnectionType>;
    },
    withTransaction: async (handle, options) => {
      const conn = await connect();
      try {
        const withTx =
          conn.withTransaction as WithDatabaseTransactionFactory<ConnectionType>['withTransaction'];
        return await withTx(handle, options);
      } finally {
        await close(conn);
      }
    },
  };
};
