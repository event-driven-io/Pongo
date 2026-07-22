import type { Connection } from '../connections';
import {
  executeWithCancellation,
  type OperationCancellationOptions,
} from '../cancellation';
import type { DatabaseDriverType } from '../drivers';
import { DumboError } from '../errors';
import type { QueryResult, QueryResultRow } from '../query';
import type { JSONDeserializeOptions, JSONSerializer } from '../serializer';
import type { SQL, SQLFormatter } from '../sql';

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

export type SQLQueryOptions = OperationCancellationOptions & {
  timeoutMs?: number | undefined;
  mapping?: SQLQueryResultColumnMapping;
};

export type SQLCommandOptions = OperationCancellationOptions & {
  timeoutMs?: number | undefined;
  mapping?: SQLQueryResultColumnMapping;
};

export type BatchSQLCommandOptions = SQLCommandOptions & {
  assertChanges?: boolean;
};

export class BatchCommandNoChangesError extends DumboError {
  static readonly ErrorCode: number = 409;
  static readonly ErrorType: string = 'BatchCommandNoChangesError';

  readonly statementIndex: number;

  constructor(statementIndex: number) {
    super({
      errorCode: BatchCommandNoChangesError.ErrorCode,
      errorType: BatchCommandNoChangesError.ErrorType,
      message: `Batch command at index ${statementIndex} affected no rows`,
    });
    this.name = 'BatchCommandNoChangesError';
    this.statementIndex = statementIndex;

    Object.setPrototypeOf(this, BatchCommandNoChangesError.prototype);
  }
}

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
    options?: BatchSQLCommandOptions,
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
    options?: BatchSQLCommandOptions,
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
      { ...options, cancellation: queryOptions },
    ),
  batchQuery: (sqls, queryOptions) =>
    executeInNewDbClient(
      (client) => sqlExecutor.batchQuery(client, sqls, queryOptions),
      { ...options, cancellation: queryOptions },
    ),
  command: (sql, commandOptions) =>
    executeInNewDbClient(
      (client) => sqlExecutor.command(client, sql, commandOptions),
      { ...options, cancellation: commandOptions },
    ),
  batchCommand: (sqls, commandOptions) =>
    executeInNewDbClient(
      (client) => sqlExecutor.batchCommand(client, sqls, commandOptions),
      { ...options, cancellation: commandOptions },
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
      { ...options, cancellation: queryOptions },
    ),
  batchQuery: (sqls, queryOptions) =>
    executeInNewConnection(
      (connection) => connection.execute.batchQuery(sqls, queryOptions),
      { ...options, cancellation: queryOptions },
    ),
  command: (sql, commandOptions) =>
    executeInNewConnection(
      (connection) => connection.execute.command(sql, commandOptions),
      { ...options, cancellation: commandOptions },
    ),
  batchCommand: (sqls, commandOptions) =>
    executeInNewConnection(
      (connection) => connection.execute.batchCommand(sqls, commandOptions),
      { ...options, cancellation: commandOptions },
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
      { ...options, cancellation: queryOptions },
    ),
  batchQuery: (sqls, queryOptions) =>
    executeInAmbientConnection(
      (connection) => connection.execute.batchQuery(sqls, queryOptions),
      { ...options, cancellation: queryOptions },
    ),
  command: (sql, commandOptions) =>
    executeInAmbientConnection(
      (connection) => connection.execute.command(sql, commandOptions),
      { ...options, cancellation: commandOptions },
    ),
  batchCommand: (sqls, commandOptions) =>
    executeInAmbientConnection(
      (connection) => connection.execute.batchCommand(sqls, commandOptions),
      { ...options, cancellation: commandOptions },
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
    cancellation?: OperationCancellationOptions | undefined;
  },
): Promise<Result> => {
  return executeWithCancellation(async () => {
    const { connect, close } = options;
    const client = await connect();
    try {
      return await handle(client);
    } catch (error) {
      if (close) await close(client, error);

      throw error;
    }
  }, options.cancellation);
};

export const executeInNewConnection = async <
  ConnectionType extends Connection,
  Result,
>(
  handle: (connection: ConnectionType) => Promise<Result>,
  options: {
    connection: () => Promise<ConnectionType>;
    cancellation?: OperationCancellationOptions | undefined;
  },
) => {
  return executeWithCancellation(async () => {
    const connection = await options.connection();

    try {
      return await handle(connection);
    } finally {
      await connection.close();
    }
  }, options.cancellation);
};

export const executeInAmbientConnection = async <
  ConnectionType extends Connection,
  Result,
>(
  handle: (connection: ConnectionType) => Promise<Result>,
  options: {
    connection: () => Promise<ConnectionType>;
    cancellation?: OperationCancellationOptions | undefined;
  },
) => {
  return executeWithCancellation(async () => {
    const connection = await options.connection();
    return handle(connection);
  }, options.cancellation);
};
