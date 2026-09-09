import {
  databaseTransaction,
  executeInNestedTransaction,
  sqlExecutor,
  type AnyConnection,
  type DatabaseTransaction,
  type DatabaseTransactionOptions,
  type DbClientTransactionContext,
  type JSONSerializer,
} from '../../../../core';
import { pgSQLExecutor } from '../execute';
import {
  PgDriverType,
  type PgConnection,
  type PgPoolOrClient,
} from './connection';

export type PgTransaction = DatabaseTransaction<
  PgConnection,
  PgTransactionOptions
>;

export type PgIsolationLevel =
  'READ UNCOMMITTED' | 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';

export type PgTransactionOptions = DatabaseTransactionOptions & {
  isolationLevel?: PgIsolationLevel;
  useSavepoints?: boolean;
};

export const pgTransaction =
  <ConnectionType extends AnyConnection = AnyConnection>(
    connection: () => ConnectionType,
    serializer: JSONSerializer,
  ) =>
  <DbClient extends PgPoolOrClient = PgPoolOrClient>(
    context: DbClientTransactionContext<DbClient, PgTransactionOptions>,
  ): DatabaseTransaction<ConnectionType> => {
    const { client: getClient, onTransactionFinished, options } = context;
    const allowNestedTransactions = options.allowNestedTransactions ?? false;
    const useSavepoints = options.useSavepoints ?? false;

    const tx = databaseTransaction(
      {
        begin: async () => {
          const client = await getClient;
          const parts = ['BEGIN'];
          if (options.isolationLevel) {
            parts.push(`ISOLATION LEVEL ${options.isolationLevel}`);
          }
          if (options.readonly) {
            parts.push('READ ONLY');
          }
          await client.query(parts.join(' '));
        },
        commit: async () => {
          const client = await getClient;
          await client.query('COMMIT');
        },
        rollback: async () => {
          const client = await getClient;
          await client.query('ROLLBACK');
        },
        savepoint: async (level) => {
          const client = await getClient;
          await client.query(`SAVEPOINT pg_savepoint_${level}`);
        },
        releaseSavepoint: async (level) => {
          const client = await getClient;
          await client.query(`RELEASE SAVEPOINT pg_savepoint_${level}`);
        },
        rollbackToSavepoint: async (level) => {
          const client = await getClient;
          await client.query(`ROLLBACK TO SAVEPOINT pg_savepoint_${level}`);
        },
      },
      {
        abort: options.abort,
        allowNestedTransactions,
        onTransactionFinished,
        useSavepoints,
      },
    );

    const transaction: DatabaseTransaction<ConnectionType> = {
      connection: connection(),
      driverType: PgDriverType,
      begin: tx.begin,
      commit: tx.commit,
      rollback: tx.rollback,
      execute: sqlExecutor(pgSQLExecutor({ serializer }), {
        connect: () => getClient,
      }),
      withTransaction: (handle, options) =>
        executeInNestedTransaction(transaction, handle, options),
      _transactionOptions: {
        ...options,
        allowNestedTransactions,
      },
    };

    return transaction;
  };
