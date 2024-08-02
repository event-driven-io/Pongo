import type {
  PongoSession,
  PongoTransaction,
  PongoTransactionOptions,
} from './typing';

export type PongoSessionOptions = {
  explicit?: boolean;
  defaultTransactionOptions: PongoTransactionOptions;
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

    transaction = {
      db: null,
      transaction: null,
      isStarting: false,
      isActive: true,
      isCommitted: false,
      options: options ?? defaultTransactionOptions,
    };
  };
  const commitTransaction = () => {
    if (transaction?.isActive !== true)
      return Promise.reject('No active transaction!');

    transaction = {
      db: null,
      transaction: null,
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
      db: null,
      transaction: null,
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
