import type { DatabaseTransaction } from '@event-driven-io/dumbo';
import { pongoTransactionCache } from './cache';
import type {
  PongoDb,
  PongoDbTransaction,
  PongoTransactionOptions,
} from './typing';

export const pongoTransaction = (
  options: PongoTransactionOptions,
): PongoDbTransaction => {
  let isCommitted = false;
  let isRolledBack = false;
  let databaseName: string | null = null;
  let transaction: DatabaseTransaction | null = null;
  const cache = pongoTransactionCache();

  return {
    cache,
    enlistDatabase: async (db: PongoDb): Promise<DatabaseTransaction> => {
      if (transaction && databaseName !== db.databaseName)
        throw new Error(
          "There's already other database assigned to transaction",
        );

      if (transaction && databaseName === db.databaseName) return transaction;

      databaseName = db.databaseName;
      transaction = db.transaction();
      await transaction.begin();

      return transaction;
    },
    commit: async () => {
      if (isCommitted) return;
      if (isRolledBack) throw new Error('Transaction is not active!');

      isCommitted = true;

      if (transaction) {
        await transaction.commit();
        transaction = null;
      }
      await cache.commit();
    },
    rollback: async (error?: unknown) => {
      if (isCommitted) throw new Error('Cannot rollback commited transaction!');
      if (isRolledBack) return;

      isRolledBack = true;

      if (transaction) {
        await transaction.rollback(error);
        transaction = null;
      }
      cache.clear();
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
