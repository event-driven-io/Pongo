import type { JSONSerializer } from '../../../../core';
import {
  sqlExecutor,
  type DatabaseTransaction,
  type DatabaseTransactionOptions,
} from '../../../../core';
import { transactionNestingCounter } from '../../core';
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
  (
    connection: () => D1Connection,
    serializer: JSONSerializer,
    defaultOptions?: D1TransactionOptions,
  ) =>
  (
    getClient: Promise<D1Client>,
    options?: {
      close: (client: D1Client, error?: unknown) => Promise<void>;
    } & D1TransactionOptions,
  ): D1Transaction => {
    const transactionCounter = transactionNestingCounter();

    const allowNestedTransactions =
      options?.allowNestedTransactions ??
      defaultOptions?.allowNestedTransactions;

    const mode = options?.mode ?? defaultOptions?.mode;

    let client: D1Client | null = null;
    let sessionClient: D1Client | null = null;

    const getDatabaseClient = async () => {
      if (client) return Promise.resolve(client);

      client = await getClient;
      return client;
    };

    return {
      connection: connection(),
      driverType: D1DriverType,
      begin: async function () {
        if (mode !== 'session_based') {
          throw new D1TransactionNotSupportedError();
        }

        const client = await getDatabaseClient();

        if (allowNestedTransactions) {
          if (transactionCounter.level >= 1) {
            transactionCounter.increment();
            return;
          }

          transactionCounter.increment();
        }

        sessionClient = await client.withSession(options?.d1Session);
      },
      commit: async function () {
        const client = await getDatabaseClient();

        try {
          if (allowNestedTransactions) {
            if (transactionCounter.level > 1) {
              transactionCounter.decrement();

              return;
            }

            transactionCounter.reset();
          }
          sessionClient = null;
        } finally {
          if (options?.close) await options?.close(client);
        }
      },
      rollback: async function (error?: unknown) {
        const client = await getDatabaseClient();
        try {
          if (allowNestedTransactions) {
            if (transactionCounter.level > 1) {
              transactionCounter.decrement();
              return;
            }
          }

          sessionClient = null;
        } finally {
          if (options?.close) await options?.close(client, error);
        }
      },
      execute: sqlExecutor(d1SQLExecutor(), {
        connect: () => {
          if (!sessionClient) {
            throw new Error(
              'Transaction has not been started. Call begin() first.',
            );
          }
          return Promise.resolve(sessionClient);
        },
      }),
      _transactionOptions: options ?? {},
    };
  };
