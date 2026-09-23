import {
  databaseTransaction,
  executeInNestedTransaction,
  single,
  SQL,
  sqlExecutor,
  type AnyConnection,
  type DatabaseTransaction,
  type DatabaseTransactionOptions,
  type DbClientTransactionContext,
  type JSONSerializer,
  type SQLExecutor,
} from '../../../../core';
import { pgSQLExecutor } from '../execute';
import { statementTimeoutSQL } from '../execute/statementTimeout';
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

const beginSQL = (options: PgTransactionOptions): SQL =>
  SQL.merge([
    SQL`BEGIN`,
    options.isolationLevel
      ? SQL`ISOLATION LEVEL ${SQL.plain(options.isolationLevel)}`
      : SQL.EMPTY,
    options.readonly ? SQL`READ ONLY` : SQL.EMPTY,
  ]);

const commitSQL = (previousStatementTimeout: string | undefined): SQL =>
  previousStatementTimeout === undefined
    ? SQL`COMMIT`
    : SQL.merge(
        [SQL`COMMIT`, statementTimeoutSQL.restore(previousStatementTimeout)],
        '; ',
      );

const beginWithStatementTimeout = async (
  execute: SQLExecutor,
  options: PgTransactionOptions,
  statementTimeoutMs: number,
): Promise<string> => {
  const { statement_timeout } = await single(
    execute.query<{ statement_timeout: string }>(
      SQL.merge(
        [
          beginSQL(options),
          statementTimeoutSQL.set(statementTimeoutMs, 'transaction'),
        ],
        '; ',
      ),
    ),
  );
  return statement_timeout;
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
    let previousStatementTimeout: string | undefined = undefined;
    const execute = sqlExecutor(pgSQLExecutor({ serializer }), {
      connect: () => getClient,
    });

    const tx = databaseTransaction(
      {
        begin: async () => {
          // Wait for the client so closing the connection after a rejected begin releases it.
          await getClient;
          if (!options.statementTimeoutMs) {
            await execute.command(beginSQL(options));
            return;
          }
          previousStatementTimeout = await beginWithStatementTimeout(
            execute,
            options,
            options.statementTimeoutMs,
          );
        },
        commit: async () => {
          await execute.command(commitSQL(previousStatementTimeout));
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
      execute,
      withTransaction: (handle, options) =>
        executeInNestedTransaction(transaction, handle, options),
      _transactionOptions: {
        ...options,
        allowNestedTransactions,
      },
    };

    return transaction;
  };
