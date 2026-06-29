import type {
  InferTransactionFromConnection,
  JSONSerializer,
} from '../../../../core';
import {
  databaseTransaction,
  SQL,
  sqlExecutor,
  type DatabaseTransaction,
  type DatabaseTransactionOptions,
  type InferDbClientFromConnection,
} from '../../../../core';
import { sqliteSQLExecutor } from '../../core/execute';
import type {
  AnySQLiteConnection,
  SQLiteClientOrPoolClient,
} from '../connections';

export type SQLiteTransaction<
  ConnectionType extends AnySQLiteConnection = AnySQLiteConnection,
  TransactionOptions extends SQLiteTransactionOptions =
    SQLiteTransactionOptions,
> = DatabaseTransaction<ConnectionType, TransactionOptions>;

export type SQLiteTransactionMode = 'DEFERRED' | 'IMMEDIATE' | 'EXCLUSIVE';

export type SQLiteTransactionOptions = DatabaseTransactionOptions & {
  mode?: SQLiteTransactionMode;
  useSavepoints?: boolean;
};

export const sqliteTransaction =
  <ConnectionType extends AnySQLiteConnection = AnySQLiteConnection>(
    driverType: ConnectionType['driverType'],
    connection: () => ConnectionType,
    allowNestedTransactions: boolean,
    serializer: JSONSerializer,
    defaultTransactionMode?: 'IMMEDIATE' | 'DEFERRED' | 'EXCLUSIVE',
  ) =>
  (
    getClient: Promise<InferDbClientFromConnection<ConnectionType>>,
    options?: {
      close: (
        client: InferDbClientFromConnection<ConnectionType>,
        error?: unknown,
      ) => Promise<void>;
    } & SQLiteTransactionOptions,
  ): InferTransactionFromConnection<ConnectionType> => {
    allowNestedTransactions =
      options?.allowNestedTransactions ?? allowNestedTransactions;
    const useSavepoints = options?.useSavepoints ?? false;

    const tx = databaseTransaction(
      {
        begin: async () => {
          const client = (await getClient) as SQLiteClientOrPoolClient;
          const mode = options?.mode ?? defaultTransactionMode ?? 'IMMEDIATE';
          await client.command(SQL`BEGIN ${SQL.plain(mode)} TRANSACTION`);
        },
        commit: async () => {
          const client = (await getClient) as SQLiteClientOrPoolClient;
          try {
            await client.command(SQL`COMMIT`);
          } finally {
            if (options?.close)
              await options.close(
                client as InferDbClientFromConnection<ConnectionType>,
              );
          }
        },
        rollback: async (error?: unknown) => {
          const client = (await getClient) as SQLiteClientOrPoolClient;
          try {
            await client.command(SQL`ROLLBACK`);
          } finally {
            if (options?.close)
              await options.close(
                client as InferDbClientFromConnection<ConnectionType>,
                error,
              );
          }
        },
        savepoint: async (level) => {
          const client = (await getClient) as SQLiteClientOrPoolClient;
          await client.command(
            SQL`SAVEPOINT transaction${SQL.plain(level.toString())}`,
          );
        },
        releaseSavepoint: async (level) => {
          const client = (await getClient) as SQLiteClientOrPoolClient;
          await client.command(
            SQL`RELEASE transaction${SQL.plain(level.toString())}`,
          );
        },
      },
      { allowNestedTransactions, useSavepoints },
    );

    const transaction: DatabaseTransaction<ConnectionType> = {
      connection: connection(),
      driverType,
      begin: tx.begin,
      commit: tx.commit,
      rollback: tx.rollback,
      execute: sqlExecutor(sqliteSQLExecutor(driverType, serializer), {
        connect: () => getClient,
      }),
      _transactionOptions: {
        ...options,
        allowNestedTransactions,
      },
    };

    return transaction as InferTransactionFromConnection<ConnectionType>;
  };
