import {
  Abort,
  databaseTransaction,
  InvalidOperationError,
  sqlExecutor,
  type AbortContext,
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

class RollbackTransactionResult<Result> extends Error {
  readonly result: Result;

  constructor(result: Result) {
    super('Cloudflare Durable Object SQLite transaction rolled back');
    this.result = result;
  }
}

const toTransactionResult = <Result>(
  transactionResult: TransactionResult<Result> | Result,
): TransactionResult<Result> =>
  transactionResult !== undefined &&
  transactionResult !== null &&
  typeof transactionResult === 'object' &&
  'success' in transactionResult
    ? transactionResult
    : { success: true, result: transactionResult };

const nestedTransactionNotAllowed = () =>
  new InvalidOperationError(
    'Cannot start a nested transaction: allowNestedTransactions is false. ' +
      'Set transactionOptions: { allowNestedTransactions: true } on your pool or connection.',
  );

export const cloudflareDurableObjectSQLiteTransaction = (
  connection: () => CloudflareDurableObjectSQLiteConnection,
  serializer: JSONSerializer,
  defaultOptions?: CloudflareDurableObjectSQLiteTransactionOptions,
) => {
  let transactionDepth = 0;

  return (
    getClient: Promise<CloudflareDurableObjectSQLiteClient>,
    options?: CloudflareDurableObjectSQLiteTransactionOptions & {
      close: (
        client: CloudflareDurableObjectSQLiteClient,
        error?: unknown,
      ) => Promise<void>;
    },
  ): CloudflareDurableObjectSQLiteTransaction => {
    const createActiveTransaction = (
      client: CloudflareDurableObjectSQLiteClient,
    ): CloudflareDurableObjectSQLiteTransaction => {
      const activeTransaction = createTransactionShell(client);
      activeTransaction.execute = sqlExecutor(
        cloudflareDurableObjectSQLiteSQLExecutor(serializer),
        {
          connect: () => Promise.resolve(client),
        },
      );
      return activeTransaction;
    };

    const createTransactionShell = (
      client?: CloudflareDurableObjectSQLiteClient,
    ): CloudflareDurableObjectSQLiteTransaction => {
      const effectiveOptions = (
        transactionOptions?: CloudflareDurableObjectSQLiteTransactionOptions,
      ) => ({
        ...defaultOptions,
        ...options,
        ...transactionOptions,
      });

      type ActiveLifecycle = {
        client: CloudflareDurableObjectSQLiteClient;
        completion: PromiseWithResolvers<void>;
        execution: Promise<void>;
      };

      let activeLifecycle: ActiveLifecycle | undefined;
      let completed = false;

      const lifecycleError = (operation: string) =>
        new InvalidOperationError(
          completed
            ? `Cannot ${operation} a transaction that has already completed.`
            : `Cannot ${operation} a transaction that has not been started.`,
        );

      const closeClient = async (
        connectedClient: CloudflareDurableObjectSQLiteClient,
        error?: unknown,
      ) => {
        if (!client && options?.close) {
          await options.close(connectedClient, error);
        }
      };

      const allowNestedTransactions =
        effectiveOptions().allowNestedTransactions ?? false;

      const lifecycle = databaseTransaction(
        {
          begin: async () => {
            if (completed) throw lifecycleError('begin');

            let connectedClient:
              CloudflareDurableObjectSQLiteClient | undefined;
            try {
              connectedClient = client ?? (await getClient);
              const started = Promise.withResolvers<void>();
              const completion = Promise.withResolvers<void>();

              const execution = connectedClient.storage.transaction(
                async () => {
                  if (transactionDepth > 0 && !allowNestedTransactions) {
                    throw nestedTransactionNotAllowed();
                  }

                  transactionDepth++;
                  started.resolve();
                  try {
                    await completion.promise;
                  } finally {
                    transactionDepth--;
                  }
                },
              );
              void execution.then(undefined, (error: unknown) => {
                started.reject(error);
              });
              await started.promise;
              activeLifecycle = {
                client: connectedClient,
                completion,
                execution,
              };
            } catch (error) {
              completed = true;
              if (connectedClient) await closeClient(connectedClient, error);
              throw error;
            }
          },
          commit: async () => {
            const running = activeLifecycle;
            if (!running) throw lifecycleError('commit');

            completed = true;
            activeLifecycle = undefined;
            running.completion.resolve();
            try {
              await running.execution;
            } finally {
              await closeClient(running.client);
            }
          },
          rollback: async (error?: unknown) => {
            const running = activeLifecycle;
            if (!running) throw lifecycleError('roll back');

            completed = true;
            activeLifecycle = undefined;
            const rollbackReason =
              error ??
              new InvalidOperationError(
                'Cloudflare Durable Object SQLite transaction rolled back',
              );
            running.completion.reject(rollbackReason);
            try {
              await running.execution;
              throw new InvalidOperationError(
                'Cloudflare Durable Object SQLite transaction did not roll back',
              );
            } catch (transactionError) {
              if (transactionError !== rollbackReason) throw transactionError;
            } finally {
              await closeClient(running.client, error);
            }
          },
        },
        { allowNestedTransactions },
      );

      const begin = async () => {
        if (!activeLifecycle && !completed) {
          const abortRejection = Abort.rejectIfAborted(effectiveOptions());
          if (abortRejection) return abortRejection;
        }
        await lifecycle.begin();
      };

      const lifecycleExecutor = sqlExecutor(
        cloudflareDurableObjectSQLiteSQLExecutor(serializer),
        {
          connect: () => {
            if (activeLifecycle) {
              return Promise.resolve(activeLifecycle.client);
            }
            if (completed) {
              return Promise.reject(
                new InvalidOperationError('Transaction has already completed.'),
              );
            }
            return Promise.reject(
              new InvalidOperationError(
                'Transaction has not been started. Call begin() first.',
              ),
            );
          },
        },
      );

      return {
        connection: connection(),
        driverType: CloudflareDurableObjectSQLiteDriverType,
        begin,
        commit: lifecycle.commit,
        rollback: lifecycle.rollback,
        execute: lifecycleExecutor,
        withTransaction: async <Result = never>(
          handle: (
            transaction: CloudflareDurableObjectSQLiteTransaction,
            context: AbortContext,
          ) => Promise<TransactionResult<Result> | Result>,
          transactionOptions?: CloudflareDurableObjectSQLiteTransactionOptions,
        ): Promise<Result> => {
          if (completed) throw lifecycleError('start');

          const resolvedOptions = effectiveOptions(transactionOptions);
          const abortRejection = Abort.rejectIfAborted(resolvedOptions);
          if (abortRejection) return abortRejection;
          const connectedClient = client ?? (await getClient);

          try {
            return await connectedClient.storage.transaction(async () => {
              if (
                transactionDepth > 0 &&
                resolvedOptions.allowNestedTransactions !== true
              ) {
                throw nestedTransactionNotAllowed();
              }

              transactionDepth++;
              try {
                const activeTransaction =
                  createActiveTransaction(connectedClient);
                const { success, result } = toTransactionResult(
                  await handle(activeTransaction, {
                    abort: Abort.from(resolvedOptions),
                  }),
                );

                if (!success) throw new RollbackTransactionResult(result);
                return result;
              } finally {
                transactionDepth--;
              }
            });
          } catch (error) {
            if (error instanceof RollbackTransactionResult) {
              return (error as RollbackTransactionResult<Result>).result;
            }
            throw error;
          } finally {
            if (!client && options?.close) {
              await options.close(connectedClient);
            }
          }
        },
        _transactionOptions: effectiveOptions(),
      };
    };

    return createTransactionShell();
  };
};
