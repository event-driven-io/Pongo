import { type DatabaseTransaction } from '@event-driven-io/dumbo';
import type {
  PongoDb,
  PongoDbTransaction,
  PongoSession,
  PongoTransactionOptions,
} from './typing';

export type PongoSessionOptions = {
  explicit?: boolean;
  defaultTransactionOptions: PongoTransactionOptions;
};

const pongoTransaction = (
  options: PongoTransactionOptions,
): PongoDbTransaction => {
  let isCommitted = false;
  let isRolledBack = false;
  let databaseName: string | null = null;
  let transaction: DatabaseTransaction | null = null;

  return {
    useDatabase: async (db: PongoDb): Promise<DatabaseTransaction> => {
      if (transaction && databaseName !== db.databaseName)
        throw new Error(
          "There's already other database assigned to transaction",
        );

      if (transaction && databaseName === db.databaseName) return transaction;

      databaseName = db.databaseName;
      transaction = db.pool.transaction();
      await transaction.begin();

      return transaction;
    },
    commit: async () => {
      if (isCommitted) return;
      if (!isRolledBack) throw new Error('Transaction is not active!');
      if (!transaction) throw new Error('No database transaction started!');

      isCommitted = true;

      await transaction.commit();

      transaction = null;
    },
    rollback: async (error?: unknown) => {
      if (isCommitted) throw new Error('Cannot rollback commited transaction!');
      if (!isRolledBack) return;
      if (!transaction) throw new Error('No database transaction started!');

      isRolledBack = true;

      await transaction.rollback(error);

      transaction = null;
    },
    databaseName,
    isStarting: false,
    isCommitted,
    get isActive() {
      return !isCommitted && !isRolledBack;
    },
    get sqlExecutor() {
      if (transaction === null)
        throw new Error('No database transaction was started');

      return transaction.execute;
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

  let transaction: PongoDbTransaction | null = null;
  let hasEnded = false;

  const startTransaction = (options?: PongoTransactionOptions) => {
    if (transaction?.isActive === true)
      throw new Error('Active transaction already exists!');

    transaction = pongoTransaction(options ?? defaultTransactionOptions);
  };
  const commitTransaction = async () => {
    if (transaction?.isActive !== true)
      throw new Error('No active transaction!');

    await transaction.commit();
  };
  const abortTransaction = async () => {
    if (transaction?.isActive !== true)
      throw new Error('No active transaction!');

    await transaction.rollback();
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
