import type {
  InferTransactionFromConnection,
  JSONSerializer,
} from '../../../../core';
import {
  InvalidOperationError,
  SQL,
  sqlExecutor,
  type DatabaseTransaction,
  type DatabaseTransactionOptions,
  type InferDbClientFromConnection,
} from '../../../../core';
import { sqliteSQLExecutor } from '../../core/execute';
import {
  transactionNestingCounter,
  type AnySQLiteConnection,
  type SQLiteClientOrPoolClient,
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
    const transactionCounter = transactionNestingCounter();
    allowNestedTransactions =
      options?.allowNestedTransactions ?? allowNestedTransactions;

    let hasBegun = false;

    const transaction: DatabaseTransaction<ConnectionType> = {
      connection: connection(),
      driverType,
      begin: async function () {
        const client = (await getClient) as SQLiteClientOrPoolClient;

        if (allowNestedTransactions) {
          if (transactionCounter.level >= 1) {
            transactionCounter.increment();
            if (options?.useSavepoints) {
              await client.command(
                SQL`SAVEPOINT transaction${SQL.plain(transactionCounter.level.toString())}`,
              );
            }
            return;
          }

          transactionCounter.increment();
        } else if (hasBegun) {
          throw new InvalidOperationError(
            'Cannot start a nested transaction: allowNestedTransactions is false. ' +
              'Set transactionOptions: { allowNestedTransactions: true } on your pool or connection.',
          );
        }

        hasBegun = true;
        const mode = options?.mode ?? defaultTransactionMode ?? 'IMMEDIATE';
        await client.command(SQL`BEGIN ${SQL.plain(mode)} TRANSACTION`);
      },
      commit: async function () {
        const client = (await getClient) as SQLiteClientOrPoolClient;

        try {
          if (allowNestedTransactions) {
            if (transactionCounter.level > 1) {
              if (options?.useSavepoints) {
                await client.command(
                  SQL`RELEASE transaction${SQL.plain(transactionCounter.level.toString())}`,
                );
              }
              transactionCounter.decrement();

              return;
            }

            transactionCounter.reset();
          }
          hasBegun = false;
          await client.command(SQL`COMMIT`);
        } finally {
          if (options?.close)
            await options?.close(
              client as InferDbClientFromConnection<ConnectionType>,
            );
        }
      },
      rollback: async function (error?: unknown) {
        const client = (await getClient) as SQLiteClientOrPoolClient;
        try {
          if (allowNestedTransactions) {
            if (transactionCounter.level > 1) {
              transactionCounter.decrement();
              return;
            }
          }

          hasBegun = false;
          await client.command(SQL`ROLLBACK`);
        } finally {
          if (options?.close)
            await options?.close(
              client as InferDbClientFromConnection<ConnectionType>,
              error,
            );
        }
      },
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
