import type {
  InferTransactionFromConnection,
  JSONSerializer,
} from '../../../../core';
import {
  databaseTransaction,
  executeInNestedTransaction,
  SQL,
  sqlExecutor,
  type DatabaseTransaction,
  type DatabaseTransactionOptions,
  type DbClientTransactionContext,
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
    serializer: JSONSerializer,
  ) =>
  (
    context: DbClientTransactionContext<
      InferDbClientFromConnection<ConnectionType>,
      SQLiteTransactionOptions
    >,
  ): InferTransactionFromConnection<ConnectionType> => {
    const { client: getClient, onTransactionFinished, options } = context;
    const allowNestedTransactions = options.allowNestedTransactions ?? false;
    const useSavepoints = options.useSavepoints ?? false;

    const tx = databaseTransaction(
      {
        begin: async () => {
          const client = (await getClient) as SQLiteClientOrPoolClient;
          const mode = options.mode ?? 'IMMEDIATE';
          await client.command(SQL`BEGIN ${SQL.plain(mode)} TRANSACTION`);
        },
        commit: async () => {
          const client = (await getClient) as SQLiteClientOrPoolClient;
          await client.command(SQL`COMMIT`);
        },
        rollback: async () => {
          const client = (await getClient) as SQLiteClientOrPoolClient;
          await client.command(SQL`ROLLBACK`);
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
        rollbackToSavepoint: async (level) => {
          const client = (await getClient) as SQLiteClientOrPoolClient;
          await client.command(
            SQL`ROLLBACK TO transaction${SQL.plain(level.toString())}`,
          );
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
      driverType,
      begin: tx.begin,
      commit: tx.commit,
      rollback: tx.rollback,
      execute: sqlExecutor(sqliteSQLExecutor(driverType, serializer), {
        connect: () => getClient,
      }),
      withTransaction: (handle, options) =>
        executeInNestedTransaction(transaction, handle, options),
      _transactionOptions: {
        ...options,
        allowNestedTransactions,
      },
    };

    return transaction as InferTransactionFromConnection<ConnectionType>;
  };
