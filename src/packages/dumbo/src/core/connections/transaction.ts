import type { WithSQLExecutor } from '../execute';
import { type Connection } from './connection';

export interface DatabaseTransaction<
  ConnectorType extends string = string,
  DbClient = unknown,
> extends WithSQLExecutor {
  type: ConnectorType;
  connection: Connection<ConnectorType, DbClient>;
  begin: () => Promise<void>;
  commit: () => Promise<void>;
  rollback: (error?: unknown) => Promise<void>;
}

export interface DatabaseTransactionFactory<
  ConnectorType extends string = string,
> {
  transaction: () => DatabaseTransaction<ConnectorType>;

  withTransaction: <Result = never>(
    handle: (
      transaction: DatabaseTransaction<ConnectorType>,
    ) => Promise<TransactionResult<Result> | Result>,
  ) => Promise<Result>;
}

export type TransactionResult<Result> = { success: boolean; result: Result };

const toTransactionResult = <Result>(
  transactionResult: TransactionResult<Result> | Result,
): TransactionResult<Result> =>
  transactionResult !== undefined &&
  transactionResult !== null &&
  typeof transactionResult === 'object' &&
  'success' in transactionResult
    ? transactionResult
    : { success: true, result: transactionResult };

export const executeInTransaction = async <
  ConnectorType extends string = string,
  Result = void,
>(
  transaction: DatabaseTransaction<ConnectorType>,
  handle: (
    transaction: DatabaseTransaction<ConnectorType>,
  ) => Promise<TransactionResult<Result> | Result>,
): Promise<Result> => {
  await transaction.begin();

  try {
    const { success, result } = toTransactionResult(await handle(transaction));

    if (success) await transaction.commit();
    else await transaction.rollback();

    return result;
  } catch (e) {
    await transaction.rollback();
    throw e;
  }
};

export const transactionFactoryWithDbClient = <
  ConnectorType extends string = string,
  DbClient = unknown,
>(
  connect: () => Promise<DbClient>,
  initTransaction: (
    client: Promise<DbClient>,
  ) => DatabaseTransaction<ConnectorType>,
): DatabaseTransactionFactory<ConnectorType> => ({
  transaction: () => initTransaction(connect()),
  withTransaction: (handle) =>
    executeInTransaction(initTransaction(connect()), handle),
});

const wrapInConnectionClosure = async <
  ConnectionType extends Connection = Connection,
  Result = unknown,
>(
  connection: ConnectionType,
  handle: () => Promise<Result>,
) => {
  try {
    return await handle();
  } finally {
    await connection.close();
  }
};

export const transactionFactoryWithNewConnection = <
  ConnectionType extends Connection = Connection,
>(
  connect: () => ConnectionType,
): DatabaseTransactionFactory<ConnectionType['type']> => ({
  transaction: () => {
    const connection = connect();
    const transaction = connection.transaction();

    return {
      ...transaction,
      commit: () =>
        wrapInConnectionClosure(connection, () => transaction.commit()),
      rollback: () =>
        wrapInConnectionClosure(connection, () => transaction.rollback()),
    };
  },
  withTransaction: (handle) => {
    const connection = connect();
    return wrapInConnectionClosure(connection, () =>
      connection.withTransaction(handle),
    );
  },
});
