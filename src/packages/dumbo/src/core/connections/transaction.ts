import type { ConnectorType } from '../connectors';
import type { WithSQLExecutor } from '../execute';
import { type Connection } from './connection';

export interface DatabaseTransaction<
  Connector extends ConnectorType = ConnectorType,
  DbClient = unknown,
> extends WithSQLExecutor {
  connector: Connector;
  connection: Connection<Connector, DbClient>;
  begin: () => Promise<void>;
  commit: () => Promise<void>;
  rollback: (error?: unknown) => Promise<void>;
}

export interface DatabaseTransactionFactory<
  Connector extends ConnectorType = ConnectorType,
  DbClient = unknown,
> {
  transaction: () => DatabaseTransaction<Connector, DbClient>;

  withTransaction: <Result = never>(
    handle: (
      transaction: DatabaseTransaction<Connector, DbClient>,
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
  Connector extends ConnectorType = ConnectorType,
  DbClient = unknown,
  Result = void,
>(
  transaction: DatabaseTransaction<Connector, DbClient>,
  handle: (
    transaction: DatabaseTransaction<Connector, DbClient>,
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
  Connector extends ConnectorType = ConnectorType,
  DbClient = unknown,
>(
  connect: () => Promise<DbClient>,
  initTransaction: (
    client: Promise<DbClient>,
    options?: { close: (client: DbClient, error?: unknown) => Promise<void> },
  ) => DatabaseTransaction<Connector, DbClient>,
): DatabaseTransactionFactory<Connector, DbClient> => {
  let currentTransaction: DatabaseTransaction<Connector, DbClient> | undefined =
    undefined;

  const getOrInitCurrentTransaction = () =>
    currentTransaction ??
    (currentTransaction = initTransaction(connect(), {
      close: () => {
        currentTransaction = undefined;
        return Promise.resolve();
      },
    }));

  return {
    transaction: getOrInitCurrentTransaction,
    withTransaction: (handle) =>
      executeInTransaction(getOrInitCurrentTransaction(), handle),
  };
};

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
): DatabaseTransactionFactory<ConnectionType['connector']> => ({
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
