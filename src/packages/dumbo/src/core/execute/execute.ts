// export const executeSQLBatchInTransaction = async <
//   Result extends QueryResultRow = QueryResultRow,
//   ConnectionType extends Connection = Connection,
// >(
//   connection: ConnectionType,
//   ...sqls: SQL[]
// ) =>
//   executeInTransaction(connection, async (client) => {
//     for (const sql of sqls) {
//       await getExecutor(connection.type).query<Result>(client, sql);
//     }
//     return { success: true, result: undefined };
//   });

import type { Connection } from '../connections';
import type { QueryResult, QueryResultRow } from '../query';
import { type SQL } from '../sql';

export type SQLExecutor<
  ConnectorType extends string = string,
  DbClient = unknown,
> = {
  type: ConnectorType;
  query<Result extends QueryResultRow = QueryResultRow>(
    client: DbClient,
    sql: SQL,
  ): Promise<QueryResult<Result>>;
  batchQuery<Result extends QueryResultRow = QueryResultRow>(
    client: DbClient,
    sqls: SQL[],
  ): Promise<QueryResult<Result>[]>;
  command<Result extends QueryResultRow = QueryResultRow>(
    client: DbClient,
    sql: SQL,
  ): Promise<QueryResult<Result>>;
  batchCommand<Result extends QueryResultRow = QueryResultRow>(
    client: DbClient,
    sqls: SQL[],
  ): Promise<QueryResult<Result>[]>;
};

export type WithSQLExecutor = {
  execute: {
    query<Result extends QueryResultRow = QueryResultRow>(
      sql: SQL,
    ): Promise<QueryResult<Result>>;
    batchQuery<Result extends QueryResultRow = QueryResultRow>(
      sqls: SQL[],
    ): Promise<QueryResult<Result>[]>;
    command<Result extends QueryResultRow = QueryResultRow>(
      sql: SQL,
    ): Promise<QueryResult<Result>>;
    batchCommand<Result extends QueryResultRow = QueryResultRow>(
      sqls: SQL[],
    ): Promise<QueryResult<Result>[]>;
  };
};

export const withSqlExecutor = <
  DbClient = unknown,
  Executor extends SQLExecutor = SQLExecutor,
>(
  sqlExecutor: Executor,
  // TODO: In the longer term we should have different options for query and command
  options: {
    connect: () => Promise<DbClient>;
    close?: (client: DbClient, error?: unknown) => Promise<void>;
  },
): WithSQLExecutor => {
  return {
    execute: {
      query: (sql) =>
        executeInNewDbClient(
          (client) => sqlExecutor.query(client, sql),
          options,
        ),
      batchQuery: (sqls) =>
        executeInNewDbClient(
          (client) => sqlExecutor.batchQuery(client, sqls),
          options,
        ),
      command: (sql) =>
        executeInNewDbClient(
          (client) => sqlExecutor.command(client, sql),
          options,
        ),
      batchCommand: (sqls) =>
        executeInNewDbClient(
          (client) => sqlExecutor.batchQuery(client, sqls),
          options,
        ),
    },
  };
};

export const withSqlExecutorInNewConnection = <
  ConnectionType extends Connection,
>(options: {
  open: () => Promise<ConnectionType>;
}): WithSQLExecutor => {
  return {
    execute: {
      query: (sql) =>
        executeInNewConnection(
          (connection) => connection.execute.query(sql),
          options,
        ),
      batchQuery: (sqls) =>
        executeInNewConnection(
          (connection) => connection.execute.batchQuery(sqls),
          options,
        ),
      command: (sql) =>
        executeInNewConnection(
          (connection) => connection.execute.command(sql),
          options,
        ),
      batchCommand: (sqls) =>
        executeInNewConnection(
          (connection) => connection.execute.batchCommand(sqls),
          options,
        ),
    },
  };
};

export const executeInNewDbClient = async <
  DbClient = unknown,
  Result = unknown,
>(
  handle: (client: DbClient) => Promise<Result>,
  options: {
    connect: () => Promise<DbClient>;
    close?: (client: DbClient, error?: unknown) => Promise<void>;
  },
): Promise<Result> => {
  const { connect, close } = options;
  const client = await connect();
  try {
    return await handle(client);
  } catch (error) {
    if (close) await close(client, error);

    throw error;
  }
};

export const executeInNewConnection = async <
  ConnectionType extends Connection,
  Result extends QueryResultRow = QueryResultRow,
>(
  handle: (connection: ConnectionType) => Promise<Result>,
  options: {
    open: () => Promise<ConnectionType>;
  },
) => {
  const { open } = options;
  const connection = await open();

  try {
    return await handle(connection);
  } finally {
    await connection.close();
  }
};
