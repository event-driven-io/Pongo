import {
  databaseTransaction,
  sqlExecutor,
  type AnyConnection,
  type DatabaseTransaction,
  type DatabaseTransactionOptions,
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
    getClient: Promise<DbClient>,
    options?: {
      close: (client: DbClient, error?: unknown) => Promise<void>;
    } & PgTransactionOptions,
  ): DatabaseTransaction<ConnectionType> => {
    const allowNestedTransactions = options?.allowNestedTransactions ?? false;
    const useSavepoints = options?.useSavepoints ?? false;

    const tx = databaseTransaction(
      {
        begin: async () => {
          const client = await getClient;
          const parts = ['BEGIN'];
          if (options?.isolationLevel) {
            parts.push(`ISOLATION LEVEL ${options.isolationLevel}`);
          }
          if (options?.readonly) {
            parts.push('READ ONLY');
          }
          await client.query(parts.join(' '));
        },
        commit: async () => {
          const client = await getClient;

          try {
            await client.query('COMMIT');
          } finally {
            if (options?.close) await options.close(client);
          }
        },
        rollback: async (error?: unknown) => {
          const client = await getClient;
          try {
            await client.query('ROLLBACK');
          } finally {
            if (options?.close) await options.close(client, error);
          }
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
      { allowNestedTransactions, useSavepoints },
    );

    return {
      connection: connection(),
      driverType: PgDriverType,
      begin: tx.begin,
      commit: tx.commit,
      rollback: tx.rollback,
      execute: sqlExecutor(pgSQLExecutor({ serializer }), {
        connect: () => getClient,
      }),
      _transactionOptions: {
        ...(options ?? {}),
        allowNestedTransactions,
      },
    };
  };
