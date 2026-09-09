import {
  Abort,
  databaseTransaction,
  InvalidOperationError,
  nestedTransactionNotAllowed,
  sqlExecutor,
  toTransactionResult,
  type AbortContext,
  type ConnectionTransactionFactory,
  type DatabaseTransaction,
  type DatabaseTransactionOptions,
  type JSONSerializer,
  type TransactionResult,
} from '../../../../core';
import {
  CloudflareDurableObjectSQLiteDriverType,
  type CloudflareDurableObjectSQLiteClient,
  type CloudflareDurableObjectSQLiteConnection,
} from '../connections';
import { cloudflareDurableObjectSQLiteSQLExecutor } from '../execute';

export type CloudflareDurableObjectSQLiteTransactionOptions = Omit<
  DatabaseTransactionOptions,
  'readonly'
>;

export type CloudflareDurableObjectSQLiteTransaction = DatabaseTransaction<
  CloudflareDurableObjectSQLiteConnection,
  CloudflareDurableObjectSQLiteTransactionOptions
>;

type RunStorageTransaction = <Result>(
  client: CloudflareDurableObjectSQLiteClient,
  allowNestedTransactions: boolean,
  handle: () => Promise<Result>,
) => Promise<Result>;

type TransactionContext = {
  connection: () => CloudflareDurableObjectSQLiteConnection;
  getClient: Promise<CloudflareDurableObjectSQLiteClient>;
  options: CloudflareDurableObjectSQLiteTransactionOptions;
  runStorageTransaction: RunStorageTransaction;
  serializer: JSONSerializer;
};

type ActiveLifecycle = {
  status: 'active';
  client: CloudflareDurableObjectSQLiteClient;
  completion: PromiseWithResolvers<void>;
  execution: Promise<void>;
};

type LifecycleState =
  { status: 'idle' } | ActiveLifecycle | { status: 'completed' };

const storageTransactionRunner = (): RunStorageTransaction => {
  let transactionDepth = 0;

  return (client, allowNestedTransactions, handle) =>
    client.storage.transaction(async () => {
      if (transactionDepth > 0 && !allowNestedTransactions) {
        throw nestedTransactionNotAllowed();
      }

      transactionDepth++;
      try {
        return await handle();
      } finally {
        transactionDepth--;
      }
    });
};

const deferredTransactionLifecycle = (
  context: TransactionContext,
  boundClient?: CloudflareDurableObjectSQLiteClient,
) => {
  let state: LifecycleState = { status: 'idle' };
  const allowNestedTransactions =
    context.options.allowNestedTransactions ?? false;

  const lifecycleError = (operation: string) =>
    new InvalidOperationError(
      state.status === 'completed'
        ? `Cannot ${operation} a transaction that has already completed.`
        : `Cannot ${operation} a transaction that has not been started.`,
    );

  const resolveClient = () => Promise.resolve(boundClient ?? context.getClient);

  const finish = (operation: string): ActiveLifecycle => {
    if (state.status !== 'active') throw lifecycleError(operation);
    const active = state;
    state = { status: 'completed' };
    return active;
  };

  const begin = async () => {
    if (state.status === 'completed') throw lifecycleError('begin');

    try {
      const client = await resolveClient();
      const started = Promise.withResolvers<void>();
      const completion = Promise.withResolvers<void>();
      const execution = context.runStorageTransaction(
        client,
        allowNestedTransactions,
        () => {
          started.resolve();
          return completion.promise;
        },
      );

      await Promise.race([started.promise, execution]);
      state = { status: 'active', client, completion, execution };
    } catch (error) {
      state = { status: 'completed' };
      throw error;
    }
  };

  const commit = async () => {
    const active = finish('commit');
    active.completion.resolve();

    await active.execution;
  };

  const rollback = async (error?: unknown) => {
    const active = finish('roll back');
    const rollbackReason =
      error ??
      new InvalidOperationError(
        'Cloudflare Durable Object SQLite transaction rolled back',
      );
    active.completion.reject(rollbackReason);

    try {
      await active.execution;
    } catch (transactionError) {
      if (transactionError === rollbackReason) {
        return;
      }
      throw transactionError;
    }

    const transactionError = new InvalidOperationError(
      'Cloudflare Durable Object SQLite transaction did not roll back',
    );
    throw transactionError;
  };

  const getActiveClient = () => {
    if (state.status === 'active') return Promise.resolve(state.client);
    if (state.status === 'completed') {
      return Promise.reject(
        new InvalidOperationError('Transaction has already completed.'),
      );
    }
    return Promise.reject(
      new InvalidOperationError(
        'Transaction has not been started. Call begin() first.',
      ),
    );
  };

  return {
    assertCanStart: () => {
      if (state.status === 'completed') throw lifecycleError('start');
    },
    begin,
    commit,
    getActiveClient,
    isIdle: () => state.status === 'idle',
    resolveClient,
    rollback,
  };
};

const createTransaction = (
  context: TransactionContext,
  boundClient?: CloudflareDurableObjectSQLiteClient,
): CloudflareDurableObjectSQLiteTransaction => {
  const lifecycle = deferredTransactionLifecycle(context, boundClient);
  const transactionLifecycle = databaseTransaction(lifecycle, {
    abort: context.options.abort,
    allowNestedTransactions: context.options.allowNestedTransactions ?? false,
  });

  return {
    connection: context.connection(),
    driverType: CloudflareDurableObjectSQLiteDriverType,
    begin: async () => {
      if (lifecycle.isIdle()) Abort.throwIfAborted(context.options);
      await transactionLifecycle.begin();
    },
    commit: transactionLifecycle.commit,
    rollback: transactionLifecycle.rollback,
    execute: sqlExecutor(
      cloudflareDurableObjectSQLiteSQLExecutor(context.serializer),
      {
        connect: boundClient
          ? lifecycle.resolveClient
          : lifecycle.getActiveClient,
      },
    ),
    withTransaction: async <Result = never>(
      handle: (
        transaction: CloudflareDurableObjectSQLiteTransaction,
        context: AbortContext,
      ) => Promise<TransactionResult<Result> | Result>,
      options?: CloudflareDurableObjectSQLiteTransactionOptions,
    ): Promise<Result> => {
      lifecycle.assertCanStart();
      const resolvedOptions = { ...context.options, ...options };
      Abort.throwIfAborted(resolvedOptions);

      const client = await lifecycle.resolveClient();
      let rollback:
        { error: InvalidOperationError; result: Result } | undefined;
      let result: Result;

      try {
        result = await context.runStorageTransaction(
          client,
          resolvedOptions.allowNestedTransactions === true,
          async () => {
            const result = await handle(createTransaction(context, client), {
              abort: Abort.from(resolvedOptions),
            });
            Abort.throwIfAborted(resolvedOptions);
            const transactionResult = toTransactionResult(result);

            if (!transactionResult.success) {
              rollback = {
                error: new InvalidOperationError(
                  'Cloudflare Durable Object SQLite transaction rolled back',
                ),
                result: transactionResult.result,
              };
              throw rollback.error;
            }
            return transactionResult.result;
          },
        );
      } catch (error) {
        if (rollback && error === rollback.error) {
          return rollback.result;
        }
        throw error;
      }

      return result;
    },
    _transactionOptions: context.options,
  };
};

export const cloudflareDurableObjectSQLiteTransaction = (
  connection: () => CloudflareDurableObjectSQLiteConnection,
  serializer: JSONSerializer,
) => {
  const runStorageTransaction = storageTransactionRunner();

  return (
    getClient: Promise<CloudflareDurableObjectSQLiteClient>,
    factoryOptions?: CloudflareDurableObjectSQLiteTransactionOptions,
  ): CloudflareDurableObjectSQLiteTransaction => {
    return createTransaction({
      connection,
      getClient,
      options: factoryOptions ?? {},
      runStorageTransaction,
      serializer,
    });
  };
};

export const cloudflareDurableObjectSQLiteTransactionFactory =
  (
    serializer: JSONSerializer,
    defaultOptions?: CloudflareDurableObjectSQLiteTransactionOptions,
  ): ConnectionTransactionFactory<CloudflareDurableObjectSQLiteConnection> =>
  (connect, connection) => {
    const initTransaction = cloudflareDurableObjectSQLiteTransaction(
      connection,
      serializer,
    );

    const resolveOptions = (
      options?: CloudflareDurableObjectSQLiteTransactionOptions,
    ): CloudflareDurableObjectSQLiteTransactionOptions => ({
      ...defaultOptions,
      ...options,
    });

    const transactionWithOptions = (
      options: CloudflareDurableObjectSQLiteTransactionOptions,
    ) => {
      Abort.throwIfAborted(options);
      return initTransaction(connect({ abort: Abort.from(options) }), options);
    };

    return {
      transaction: (options) => transactionWithOptions(resolveOptions(options)),
      withTransaction: (handle, options) => {
        const resolvedOptions = resolveOptions(options);
        const abortRejection = Abort.rejectIfAborted(resolvedOptions);
        if (abortRejection) return abortRejection;
        return transactionWithOptions(resolvedOptions).withTransaction(handle);
      },
    };
  };
