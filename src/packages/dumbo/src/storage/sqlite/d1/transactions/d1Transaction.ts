import type { D1DatabaseSession } from '@cloudflare/workers-types';
import { sqlExecutor, type DatabaseTransaction } from '../../../../core';
import { sqliteSQLExecutor, transactionNestingCounter } from '../../core';
import {
  d1Client,
  D1DriverType,
  type D1Client,
  type D1Connection,
} from '../connections';

export type D1Transaction = DatabaseTransaction<D1Connection>;

export type D1TransactionMode = 'strict' | 'compatible';

export type D1TransactionOptions = {
  mode?: D1TransactionMode; // Default: 'strict'
};

export class D1TransactionNotSupportedError extends Error {
  constructor() {
    super(
      'D1 does not support SQL transactions (BEGIN/COMMIT/ROLLBACK/SAVEPOINT). ' +
        'Use { mode: "compatible" } to opt-in to session+batch semantics, or use ' +
        'connection.execute.batchCommand() for atomic multi-statement execution.',
    );
    this.name = 'D1TransactionNotSupportedError';
  }
}

export const d1Transaction =
  (connection: () => D1Connection, allowNestedTransactions: boolean) =>
  (
    getClient: Promise<D1Client>,
    options?: {
      close: (client: D1Client, error?: unknown) => Promise<void>;
    },
  ): D1Transaction => {
    const transactionCounter = transactionNestingCounter();

    let session: D1DatabaseSession | null = null;
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
        const client = await getDatabaseClient();

        if (allowNestedTransactions) {
          if (transactionCounter.level >= 1) {
            transactionCounter.increment();
            return;
          }

          transactionCounter.increment();
        }

        session = client.database.withSession();
        sessionClient = d1Client({ database: client.database, session });
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
          session = null;
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

          session = null;
          sessionClient = null;
        } finally {
          if (options?.close) await options?.close(client, error);
        }
      },
      execute: sqlExecutor(sqliteSQLExecutor(D1DriverType), {
        connect: () => {
          if (!sessionClient) {
            throw new Error(
              'Transaction has not been started. Call begin() first.',
            );
          }
          return Promise.resolve(sessionClient);
        },
      }),
    };
  };
