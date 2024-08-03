import type { DatabaseTransaction } from '@event-driven-io/dumbo';
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

  return {
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
      if (!transaction) throw new Error('No database transaction started!');
      if (isCommitted) return;
      if (isRolledBack) throw new Error('Transaction is not active!');

      isCommitted = true;

      await transaction.commit();

      transaction = null;
    },
    rollback: async (error?: unknown) => {
      if (!transaction) throw new Error('No database transaction started!');
      if (isCommitted) throw new Error('Cannot rollback commited transaction!');
      if (isRolledBack) return;

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
