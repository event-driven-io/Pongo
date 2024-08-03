import { pongoTransaction } from './pongoTransaction';
import type {
  PongoDbTransaction,
  PongoSession,
  PongoTransactionOptions,
} from './typing';

export type PongoSessionOptions = {
  explicit?: boolean;
  defaultTransactionOptions: PongoTransactionOptions;
};

const isActive = (
  transaction: PongoDbTransaction | null,
): transaction is PongoDbTransaction => transaction?.isActive === true;

function assertInActiveTransaction(
  transaction: PongoDbTransaction | null,
): asserts transaction is PongoDbTransaction {
  if (!isActive(transaction)) throw new Error('No active transaction exists!');
}

function assertNotInActiveTransaction(
  transaction: PongoDbTransaction | null,
): asserts transaction is null {
  if (isActive(transaction))
    throw new Error('Active transaction already exists!');
}

export const pongoSession = (options?: PongoSessionOptions): PongoSession => {
  const explicit = options?.explicit === true;
  const defaultTransactionOptions: PongoTransactionOptions =
    options?.defaultTransactionOptions ?? {
      get snapshotEnabled() {
        return false;
      },
    };

  let transaction: PongoDbTransaction | null = null;
  let hasEnded = false;

  const startTransaction = (options?: PongoTransactionOptions) => {
    assertNotInActiveTransaction(transaction);

    transaction = pongoTransaction(options ?? defaultTransactionOptions);
  };
  const commitTransaction = async () => {
    assertInActiveTransaction(transaction);

    await transaction.commit();
  };
  const abortTransaction = async () => {
    assertInActiveTransaction(transaction);

    await transaction.rollback();
  };

  const endSession = async (): Promise<void> => {
    if (hasEnded) return;
    hasEnded = true;

    if (isActive(transaction)) await transaction.rollback();
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
    endSession,
    incrementTransactionNumber: () => {},
    inTransaction: () => isActive(transaction),
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
