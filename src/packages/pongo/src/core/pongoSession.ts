import type { CacheConfig, PongoCache } from './cache';
import { PongoError } from './errors';
import { pongoTransaction } from './pongoTransaction';
import type {
  PongoDbTransaction,
  PongoSession,
  PongoTransactionOptions,
} from './typing';

export type PongoSessionOptions = {
  explicit?: boolean;
  defaultTransactionOptions?: PongoTransactionOptions | undefined;
  defaultTimeoutMS?: number | undefined;
  cache?: CacheConfig | 'disabled' | PongoCache;
};

const isActive = (
  transaction: PongoDbTransaction | null,
): transaction is PongoDbTransaction => transaction?.isActive === true;

function assertInActiveTransaction(
  transaction: PongoDbTransaction | null,
): asserts transaction is PongoDbTransaction {
  if (!isActive(transaction))
    throw new PongoError('No active transaction exists!');
}

function assertNotInActiveTransaction(
  transaction: PongoDbTransaction | null,
): asserts transaction is null {
  if (isActive(transaction))
    throw new PongoError('Active transaction already exists!');
}

export const pongoSession = (options?: PongoSessionOptions): PongoSession => {
  const explicit = options?.explicit === true;
  const defaultTimeoutMS = options?.defaultTimeoutMS;
  const defaultTransactionOptions: PongoTransactionOptions =
    options?.defaultTransactionOptions ?? {};

  let transaction: PongoDbTransaction | null = null;
  let hasEnded = false;

  const startTransaction = (options?: PongoTransactionOptions) => {
    assertNotInActiveTransaction(transaction);

    const transactionOptions = options ?? defaultTransactionOptions;

    transaction = pongoTransaction({
      ...transactionOptions,
      timeoutMS: transactionOptions.timeoutMS ?? defaultTimeoutMS,
    });
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
    defaultTransactionOptions,
    defaultTimeoutMS,
    get transaction() {
      return transaction;
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
