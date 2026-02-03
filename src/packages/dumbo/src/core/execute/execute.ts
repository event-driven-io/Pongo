import type { Connection } from '../connections';
import { type DatabaseDriverType } from '../drivers';
import type { QueryResult, QueryResultRow } from '../query';
import { JSONSerializer, type JSONDeserializeOptions } from '../serializer';
import { type SQL, type SQLFormatter } from '../sql';

export const mapColumnToJSON = (
  column: string,
  serializer: JSONSerializer,
  options?: JSONDeserializeOptions,
) => ({
  [column]: (value: unknown) => {
    if (typeof value === 'string') {
      try {
        return serializer.deserialize(value, options);
      } catch {
        // ignore
      }
    }

    return value;
  },
});

export const mapColumnToBigint = (column: string) => ({
  [column]: (value: unknown) => {
    if (typeof value === 'number' || typeof value === 'string') {
      return BigInt(value);
    }

    return value;
  },
});

export const mapColumnToDate = (column: string) => ({
  [column]: (value: unknown) => {
    if (typeof value === 'number' || typeof value === 'string') {
      return new Date(value);
    }

    return value;
  },
});

export const mapSQLQueryResult = <T>(
  result: T,
  mapping: SQLQueryResultColumnMapping,
) => {
  if (typeof result !== 'object' || result === null) return result;

  const mappedResult: Record<string, unknown> = {
    ...(result as Record<string, unknown>),
  };

  for (const column of Object.keys(mapping)) {
    if (column in mappedResult) {
      mappedResult[column] = mapping[column]!(mappedResult[column]);
    }
  }

  return mappedResult as T;
};

export type SQLQueryResultColumnMapping = {
  [column: string]: (value: unknown) => unknown;
};

export type SQLQueryOptions = {
  timeoutMs?: number;
  mapping?: SQLQueryResultColumnMapping;
};

export type SQLCommandOptions = {
  timeoutMs?: number;
  mapping?: SQLQueryResultColumnMapping;
};

export type DbSQLExecutorOptions = {
  serializer: JSONSerializer;
};

export interface DbSQLExecutor<
  DriverType extends DatabaseDriverType = DatabaseDriverType,
  DbClient = unknown,
> {
  driverType: DriverType;
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
  formatter: SQLFormatter;
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
      (client) => sqlExecutor.batchCommand(client, sqls, commandOptions),
      options,
    ),
});

export const sqlExecutorInNewConnection = <
  ConnectionType extends Connection,
>(options: {
  driverType: ConnectionType['driverType'];
  connection: () => Promise<ConnectionType>;
}): SQLExecutor => ({
  query: (sql, queryOptions) =>
    executeInNewConnection(
      (connection) => connection.execute.query(sql, queryOptions),
      options,
    ),
  batchQuery: (sqls, queryOptions) =>
    executeInNewConnection(
      (connection) => connection.execute.batchQuery(sqls, queryOptions),
      options,
    ),
  command: (sql, commandOptions) =>
    executeInNewConnection(
      (connection) => connection.execute.command(sql, commandOptions),
      options,
    ),
  batchCommand: (sqls, commandOptions) =>
    executeInNewConnection(
      (connection) => connection.execute.batchCommand(sqls, commandOptions),
      options,
    ),
});

export const sqlExecutorInAmbientConnection = <
  ConnectionType extends Connection,
>(options: {
  driverType: ConnectionType['driverType'];
  connection: () => Promise<ConnectionType>;
}): SQLExecutor => ({
  query: (sql, queryOptions) =>
    executeInAmbientConnection(
      (connection) => connection.execute.query(sql, queryOptions),
      options,
    ),
  batchQuery: (sqls, queryOptions) =>
    executeInAmbientConnection(
      (connection) => connection.execute.batchQuery(sqls, queryOptions),
      options,
    ),
  command: (sql, commandOptions) =>
    executeInAmbientConnection(
      (connection) => connection.execute.command(sql, commandOptions),
      options,
    ),
  batchCommand: (sqls, commandOptions) =>
    executeInAmbientConnection(
      (connection) => connection.execute.batchCommand(sqls, commandOptions),
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

export const executeInAmbientConnection = async <
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
    // Do not close the connection in ambient connection context
  }
};
