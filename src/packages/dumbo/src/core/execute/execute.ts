import type { Connection } from '../connections';
import type { QueryResult, QueryResultRow } from '../query';
import { type SQL } from '../sql';

export type SQLQueryOptions = { timeoutMs?: number };
export type SQLCommandOptions = { timeoutMs?: number };

export interface DbSQLExecutor<
  ConnectorType extends string = string,
  DbClient = unknown,
> {
  type: ConnectorType;
  query<Result extends QueryResultRow = QueryResultRow>(
    client: DbClient,
    sql: SQL,
    options?: SQLQueryOptions,
  ): Promise<QueryResult<Result>>;
  batchQuery<Result extends QueryResultRow = QueryResultRow>(
    client: DbClient,
    sqls: SQL[],
    options?: SQLQueryOptions,
  ): Promise<QueryResult<Result>[]>;
  command<Result extends QueryResultRow = QueryResultRow>(
    client: DbClient,
    sql: SQL,
    options?: SQLCommandOptions,
  ): Promise<QueryResult<Result>>;
  batchCommand<Result extends QueryResultRow = QueryResultRow>(
    client: DbClient,
    sqls: SQL[],
    options?: SQLCommandOptions,
  ): Promise<QueryResult<Result>[]>;
}

export interface SQLExecutor {
  query<Result extends QueryResultRow = QueryResultRow>(
    sql: SQL,
    options?: SQLQueryOptions,
  ): Promise<QueryResult<Result>>;
  batchQuery<Result extends QueryResultRow = QueryResultRow>(
    sqls: SQL[],
    options?: SQLQueryOptions,
  ): Promise<QueryResult<Result>[]>;
  command<Result extends QueryResultRow = QueryResultRow>(
    sql: SQL,
    options?: SQLCommandOptions,
  ): Promise<QueryResult<Result>>;
  batchCommand<Result extends QueryResultRow = QueryResultRow>(
    sqls: SQL[],
    options?: SQLCommandOptions,
  ): Promise<QueryResult<Result>[]>;
}

export interface WithSQLExecutor {
  execute: SQLExecutor;
}

export const sqlExecutor = <
  DbClient = unknown,
  DbExecutor extends DbSQLExecutor = DbSQLExecutor,
>(
  sqlExecutor: DbExecutor,
  // TODO: In the longer term we should have different options for query and command
  options: {
    connect: () => Promise<DbClient>;
    close?: (client: DbClient, error?: unknown) => Promise<void>;
  },
): SQLExecutor => ({
  query: (sql, queryOptions) =>
    executeInNewDbClient(
      (client) => sqlExecutor.query(client, sql, queryOptions),
      options,
    ),
  batchQuery: (sqls, queryOptions) =>
    executeInNewDbClient(
      (client) => sqlExecutor.batchQuery(client, sqls, queryOptions),
      options,
    ),
  command: (sql, commandOptions) =>
    executeInNewDbClient(
      (client) => sqlExecutor.command(client, sql, commandOptions),
      options,
    ),
  batchCommand: (sqls, commandOptions) =>
    executeInNewDbClient(
      (client) => sqlExecutor.batchQuery(client, sqls, commandOptions),
      options,
    ),
});

export const sqlExecutorInNewConnection = <
  ConnectionType extends Connection,
>(options: {
  connection: () => Promise<ConnectionType>;
}): SQLExecutor => ({
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
});

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
  Result,
>(
  handle: (connection: ConnectionType) => Promise<Result>,
  options: {
    connection: () => Promise<ConnectionType>;
  },
) => {
  const connection = await options.connection();

  try {
    return await handle(connection);
  } finally {
    await connection.close();
  }
};
