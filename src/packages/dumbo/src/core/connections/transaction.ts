import { InvalidOperationError } from '../errors';
import type { WithSQLExecutor } from '../execute';
import { Abort, type AbortContext, type AbortOptions } from '../taskProcessing';
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
  withTransaction: <Result = never>(
    handle: (
      transaction: DatabaseTransaction<ConnectionType, TransactionOptionsType>,
      context: AbortContext,
    ) => Promise<TransactionResult<Result> | Result>,
    options?: TransactionOptionsType,
  ) => Promise<Result>;
  _transactionOptions: TransactionOptionsType;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyDatabaseTransaction = DatabaseTransaction<any, any>;

export type DatabaseTransactionOptions = AbortOptions & {
  allowNestedTransactions?: boolean;
  readonly?: boolean;
};

export type TransactionNestingCounter = {
  increment: () => void;
  decrement: () => void;
  reset: () => void;
  level: number;
};

export const transactionNestingCounter = (): TransactionNestingCounter => {
  let transactionLevel = 0;

  return {
    reset: () => {
      transactionLevel = 0;
    },
    increment: () => {
      transactionLevel++;
    },
    decrement: () => {
      transactionLevel--;

      if (transactionLevel < 0) {
        throw new InvalidOperationError('Transaction level is out of bounds');
      }
    },
    get level() {
      return transactionLevel;
    },
  };
};

export const databaseTransaction = (
  backend: Pick<DatabaseTransaction, 'begin' | 'commit' | 'rollback'> & {
    savepoint?: ((level: number) => Promise<void>) | undefined;
    releaseSavepoint?: ((level: number) => Promise<void>) | undefined;
    rollbackToSavepoint?: ((level: number) => Promise<void>) | undefined;
  },
  options?: {
    abort?: AbortOptions['abort'];
    allowNestedTransactions?: boolean | undefined;
    onTransactionFinished?: (() => void) | undefined;
    useSavepoints?: boolean | undefined;
  },
): Pick<DatabaseTransaction, 'begin' | 'commit' | 'rollback'> => {
  const allowNestedTransactions = options?.allowNestedTransactions ?? false;
  const useSavepoints = options?.useSavepoints ?? false;
  const counter = transactionNestingCounter();
  let hasBegun = false;

  const begin = async () => {
    if (!allowNestedTransactions && hasBegun) {
      throw nestedTransactionNotAllowed();
    }
    if (allowNestedTransactions) {
      if (counter.level >= 1) {
        counter.increment();
        if (useSavepoints && backend.savepoint) {
          await backend.savepoint(counter.level);
        }
        return;
      }
    }

    try {
      Abort.throwIfAborted(options);
      if (allowNestedTransactions) counter.increment();
      hasBegun = true;
      await backend.begin();
    } catch (error) {
      if (allowNestedTransactions) counter.reset();
      hasBegun = false;
      options?.onTransactionFinished?.();
      throw error;
    }
  };

  const rollback = async (error?: unknown) => {
    if (allowNestedTransactions && counter.level > 1) {
      if (useSavepoints && backend.rollbackToSavepoint) {
        await backend.rollbackToSavepoint(counter.level);
      }
      counter.decrement();
      return;
    }

    if (allowNestedTransactions) counter.reset();
    hasBegun = false;
    try {
      await backend.rollback(error);
    } finally {
      options?.onTransactionFinished?.();
    }
  };

  const commit = async () => {
    if (hasBegun) {
      try {
        Abort.throwIfAborted(options);
      } catch (error) {
        try {
          await rollback(error);
        } catch {
          throw error;
        }
        throw error;
      }
    }

    if (allowNestedTransactions && counter.level > 1) {
      if (useSavepoints && backend.releaseSavepoint) {
        await backend.releaseSavepoint(counter.level);
      }
      counter.decrement();
      return;
    }

    if (allowNestedTransactions) counter.reset();
    hasBegun = false;
    try {
      await backend.commit();
    } finally {
      options?.onTransactionFinished?.();
    }
  };

  return { begin, commit, rollback };
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
      context: AbortContext,
    ) => Promise<TransactionResult<Result> | Result>,
    options?: InferTransactionOptionsFromConnection<ConnectionType>,
  ) => Promise<Result>;
}

export type TransactionResult<Result> = { success: boolean; result: Result };

export const toTransactionResult = <Result>(
  transactionResult: TransactionResult<Result> | Result,
): TransactionResult<Result> =>
  transactionResult !== undefined &&
  transactionResult !== null &&
  typeof transactionResult === 'object' &&
  'success' in transactionResult
    ? transactionResult
    : { success: true, result: transactionResult };

export const nestedTransactionNotAllowed = () =>
  new InvalidOperationError(
    'Cannot start a nested transaction: allowNestedTransactions is false. ' +
      'Set transactionOptions: { allowNestedTransactions: true } on your pool or connection.',
  );

type TransactionLifecycle = {
  begin: () => Promise<void>;
  commit: () => Promise<void>;
  rollback: (error?: unknown) => Promise<void>;
};

type NestedTransactionLifecycle<
  TransactionOptionsType extends DatabaseTransactionOptions,
> = TransactionLifecycle & {
  _transactionOptions: TransactionOptionsType;
};

export const executeInTransaction = async <
  DatabaseTransactionType extends TransactionLifecycle = TransactionLifecycle,
  Result = void,
>(
  transaction: DatabaseTransactionType,
  handle: (
    transaction: DatabaseTransactionType,
    context: AbortContext,
  ) => Promise<TransactionResult<Result> | Result>,
  context: AbortContext = { abort: Abort.never },
): Promise<Result> => {
  await transaction.begin();

  let transactionResult: TransactionResult<Result>;
  try {
    Abort.throwIfAborted(context);
    transactionResult = toTransactionResult(await handle(transaction, context));
    Abort.throwIfAborted(context);
  } catch (e) {
    try {
      await transaction.rollback(e);
    } catch {
      // Rollback failure must not replace the original callback or abort error.
      throw e;
    }
    throw e;
  }

  if (transactionResult.success) await transaction.commit();
  else await transaction.rollback();

  return transactionResult.result;
};

export const executeInNestedTransaction = async <
  TransactionOptionsType extends DatabaseTransactionOptions =
    DatabaseTransactionOptions,
  DatabaseTransactionType extends
    NestedTransactionLifecycle<TransactionOptionsType> =
    NestedTransactionLifecycle<TransactionOptionsType>,
  Result = void,
>(
  transaction: DatabaseTransactionType,
  handle: (
    transaction: DatabaseTransactionType,
    context: AbortContext,
  ) => Promise<TransactionResult<Result> | Result>,
  options?: TransactionOptionsType,
  context?: AbortContext,
): Promise<Result> => {
  const resolvedOptions = Object.assign(
    {},
    transaction._transactionOptions,
    options,
  );
  Abort.throwIfAborted(resolvedOptions);

  const allowNestedTransactions =
    resolvedOptions.allowNestedTransactions ?? false;

  if (!allowNestedTransactions) {
    throw nestedTransactionNotAllowed();
  }

  return executeInTransaction(
    transaction,
    handle,
    context ?? { abort: Abort.from(resolvedOptions) },
  );
};

export type DbClientTransactionContext<
  DbClient,
  TransactionOptionsType extends DatabaseTransactionOptions,
> = {
  client: Promise<DbClient>;
  options: TransactionOptionsType;
  onTransactionFinished: () => void;
};

export const transactionFactoryWithDbClient = <
  ConnectionType extends AnyConnection = AnyConnection,
  TransactionOptionsType extends DatabaseTransactionOptions =
    InferTransactionOptionsFromConnection<ConnectionType>,
>({
  connect,
  defaultOptions,
  initTransaction,
}: {
  connect: (
    context: AbortContext,
  ) => Promise<InferDbClientFromConnection<ConnectionType>>;
  defaultOptions?: TransactionOptionsType | undefined;
  initTransaction: (
    context: DbClientTransactionContext<
      InferDbClientFromConnection<ConnectionType>,
      TransactionOptionsType
    >,
  ) => InferTransactionFromConnection<ConnectionType>;
}): WithDatabaseTransactionFactory<ConnectionType> => {
  let activeTransaction:
    InferTransactionFromConnection<ConnectionType> | undefined = undefined;

  const resolveOptions = (
    perCallOptions?: InferTransactionOptionsFromConnection<ConnectionType>,
  ): TransactionOptionsType =>
    Object.assign({}, defaultOptions, perCallOptions);

  const clearActiveTransaction = (
    transaction: InferTransactionFromConnection<ConnectionType>,
  ) => {
    if (activeTransaction === transaction) activeTransaction = undefined;
  };

  const getOrCreateActiveTransaction = (options: TransactionOptionsType) => {
    Abort.throwIfAborted(options);

    if (activeTransaction) return activeTransaction;

    const transaction = initTransaction({
      client: connect({ abort: Abort.from(options) }),
      options,
      onTransactionFinished: () => clearActiveTransaction(transaction),
    });
    activeTransaction = transaction;
    return transaction;
  };

  return {
    transaction: (options) =>
      getOrCreateActiveTransaction(resolveOptions(options)),
    withTransaction: (handle, perCallOptions) => {
      const options = resolveOptions(perCallOptions);
      const abortRejection = Abort.rejectIfAborted(options);
      if (abortRejection) return abortRejection;

      return executeInTransaction(
        getOrCreateActiveTransaction(options),
        handle,
        {
          abort: Abort.from(options),
        },
      );
    },
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
  connect: (context: AbortContext) => ConnectionType,
): WithDatabaseTransactionFactory<ConnectionType> => ({
  transaction: (options) => {
    Abort.throwIfAborted(options);

    const connection = connect({ abort: Abort.from(options) });
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
    const abortRejection = Abort.rejectIfAborted(options);
    if (abortRejection) return abortRejection;

    const connection = connect({ abort: Abort.from(options) });
    const withTx =
      connection.withTransaction as WithDatabaseTransactionFactory<ConnectionType>['withTransaction'];
    return wrapInConnectionClosure(connection, () => withTx(handle, options));
  },
});

export const transactionFactoryWithAmbientConnection = <
  ConnectionType extends AnyConnection = AnyConnection,
>(
  connect: (context: AbortContext) => ConnectionType,
): WithDatabaseTransactionFactory<ConnectionType> => ({
  transaction: (options) => {
    Abort.throwIfAborted(options);

    const connection = connect({ abort: Abort.from(options) });
    const transaction = connection.transaction(options);

    return {
      ...transaction,
      commit: () => transaction.commit(),
      rollback: () => transaction.rollback(),
    } as InferTransactionFromConnection<ConnectionType>;
  },
  withTransaction: (handle, options) => {
    const abortRejection = Abort.rejectIfAborted(options);
    if (abortRejection) return abortRejection;

    const connection = connect({ abort: Abort.from(options) });
    const withTx =
      connection.withTransaction as WithDatabaseTransactionFactory<ConnectionType>['withTransaction'];
    return withTx(handle, options);
  },
});

export const transactionFactoryWithAsyncAmbientConnection = <
  ConnectionType extends AnyConnection = AnyConnection,
>(
  driverType: ConnectionType['driverType'],
  connect: (context: AbortContext) => Promise<ConnectionType>,
  close?: (connection: ConnectionType) => void | Promise<void>,
): WithDatabaseTransactionFactory<ConnectionType> => {
  close ??= () => Promise.resolve();
  return {
    transaction: (options) => {
      Abort.throwIfAborted(options);

      let conn: ConnectionType | null = null;
      let innerTx: DatabaseTransaction<ConnectionType> | null = null;
      let connectingPromise: Promise<void> | null = null;

      const ensureConnection = async () => {
        if (conn) return innerTx!;

        if (!connectingPromise) {
          connectingPromise = (async () => {
            Abort.throwIfAborted(options);
            conn = await connect({ abort: Abort.from(options) });
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
            throw new InvalidOperationError(
              'Transaction not started - call begin() first',
            );
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
            throw new InvalidOperationError('Transaction not started');
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
        withTransaction: (handle, options) =>
          executeInNestedTransaction(tx, handle, options, {
            abort: Abort.from(options),
          }),
        _transactionOptions: options ?? {},
      };

      return tx as InferTransactionFromConnection<ConnectionType>;
    },
    withTransaction: async (handle, options) => {
      Abort.throwIfAborted(options);

      const conn = await connect({ abort: Abort.from(options) });
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
