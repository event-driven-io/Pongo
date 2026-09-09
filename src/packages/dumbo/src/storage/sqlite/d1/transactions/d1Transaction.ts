import {
  databaseTransaction,
  executeInNestedTransaction,
  InvalidOperationError,
  sqlExecutor,
  type DatabaseTransaction,
  type DatabaseTransactionOptions,
  type DbClientTransactionContext,
} from '../../../../core';
import {
  D1DriverType,
  type D1Client,
  type D1Connection,
  type D1SessionOptions,
} from '../connections';
import { d1SQLExecutor } from '../execute';

export type D1Transaction = DatabaseTransaction<
  D1Connection,
  D1TransactionOptions
>;

export type D1TransactionOptions = DatabaseTransactionOptions & {
  d1Session?: D1SessionOptions;
  mode?: D1TransactionMode;
};

export type D1TransactionMode = 'session_based' | 'strict';

export class D1TransactionNotSupportedError extends Error {
  constructor() {
    super(
      'D1 does not support SQL transactions (BEGIN/COMMIT/ROLLBACK/SAVEPOINT). ' +
        'Use { mode: "session_based" } to opt-in to session+batch semantics, or use ' +
        'connection.execute.batchCommand() for atomic multi-statement execution.',
    );
    this.name = 'D1TransactionNotSupportedError';
  }
}

export const d1Transaction =
  (connection: () => D1Connection) =>
  (
    context: DbClientTransactionContext<D1Client, D1TransactionOptions>,
  ): D1Transaction => {
    const { client: getClient, onTransactionFinished, options } = context;
    const allowNestedTransactions = options.allowNestedTransactions;
    const mode = options.mode;

    let client: D1Client | null = null;
    let sessionClient: D1Client | null = null;

    const getDatabaseClient = async () => {
      if (client) return Promise.resolve(client);

      client = await getClient;
      return client;
    };

    const transactionLifecycle = databaseTransaction(
      {
        begin: async () => {
          if (mode !== 'session_based') {
            throw new D1TransactionNotSupportedError();
          }

          const client = await getDatabaseClient();
          sessionClient = await client.withSession(options.d1Session);
        },
        commit: async () => {
          await getDatabaseClient();
          sessionClient = null;
        },
        rollback: async () => {
          await getDatabaseClient();
          sessionClient = null;
        },
      },
      {
        abort: options.abort,
        allowNestedTransactions,
        onTransactionFinished,
      },
    );

    const transaction: D1Transaction = {
      connection: connection(),
      driverType: D1DriverType,
      begin: transactionLifecycle.begin,
      commit: transactionLifecycle.commit,
      rollback: transactionLifecycle.rollback,
      execute: sqlExecutor(d1SQLExecutor(), {
        connect: () => {
          if (!sessionClient) {
            throw new InvalidOperationError(
              'Transaction has not been started. Call begin() first.',
            );
          }
          return Promise.resolve(sessionClient);
        },
      }),
      withTransaction: (handle, options) =>
        executeInNestedTransaction(transaction, handle, options),
      _transactionOptions: options,
    };

    return transaction;
  };
