import { type DatabaseTransaction } from '@event-driven-io/dumbo';
import type { DbClient } from './dbClient';
import type {
  PongoSession,
  PongoTransaction,
  PongoTransactionOptions,
} from './typing';

export type PongoSessionOptions = {
  explicit?: boolean;
  defaultTransactionOptions: PongoTransactionOptions;
};

const pongoTransaction = (
  options: PongoTransactionOptions,
): PongoTransaction => {
  const isStarting = false;
  const isActive = true;
  const isCommitted = false;
  let databaseName: string | null;
  let transaction: DatabaseTransaction | null = null;

  return {
    get isStarting() {
      return isStarting;
    },
    get isActive() {
      return isActive;
    },
    get isCommitted() {
      return isCommitted;
    },
    get sqlExecutor() {
      if (transaction === null)
        throw new Error('No database transaction was started');

      return transaction.execute;
    },
    useDatabase: (db: DbClient) => {
      if (transaction && databaseName !== db.databaseName)
        throw new Error(
          "There's already other database assigned to transaction",
        );

      if (transaction && databaseName === db.databaseName) return;

      databaseName = db.databaseName;

      transaction = db.pool.transaction();
    },
    options,
  };
};

export const pongoSession = (options?: PongoSessionOptions): PongoSession => {
  const explicit = options?.explicit === true;
  const defaultTransactionOptions: PongoTransactionOptions =
    options?.defaultTransactionOptions ?? {
      get snapshotEnabled() {
        return false;
      },
    };

  let transaction: PongoTransaction | null = null;
  let hasEnded = false;

  const startTransaction = (options?: PongoTransactionOptions) => {
    if (transaction?.isActive === true)
      throw new Error('Active transaction already exists!');

    return pongoTransaction(options ?? defaultTransactionOptions);
  };
  const commitTransaction = () => {
    if (transaction?.isActive !== true)
      return Promise.reject('No active transaction!');

    transaction = {
      isStarting: false,
      isActive: false,
      isCommitted: true,
      options: transaction.options,
    };
    return Promise.resolve();
  };
  const abortTransaction = () => {
    if (transaction?.isActive !== true)
      return Promise.reject('No active transaction!');

    transaction = {
      isStarting: false,
      isActive: false,
      isCommitted: false,
      options: transaction.options,
    };
    return Promise.resolve();
  };

  const session = {
    get hasEnded() {
      return hasEnded;
    },
    explicit,
    defaultTransactionOptions: defaultTransactionOptions ?? {
      get snapshotEnabled() {
        return false;
      },
    },
    get transaction() {
      return transaction;
    },
    get snapshotEnabled() {
      return defaultTransactionOptions.snapshotEnabled;
    },
    endSession: (): Promise<void> => {
      if (hasEnded) return Promise.resolve();
      hasEnded = true;

      return Promise.resolve();
    },
    incrementTransactionNumber: () => {},
    inTransaction: () => transaction !== null,
    startTransaction,
    commitTransaction,
    abortTransaction,
    withTransaction: async <T = unknown>(
      fn: (session: PongoSession) => Promise<T>,
      options?: PongoTransactionOptions,
    ): Promise<T> => {
      startTransaction(options);

      try {
        const result = await fn(session);
        await commitTransaction();
        return result;
      } catch (error) {
        await abortTransaction();
        throw error;
      }
    },
  };

  return session;
};
