import { type SQL } from '../sql';
import type { Connection } from './connection';

export interface QueryResultRow {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [column: string]: any;
}

export type QueryResult<Result extends QueryResultRow = QueryResultRow> = {
  rowCount: number | null;
  rows: Result[];
};

export type SQLExecutor<
  ConnectorType extends string = string,
  DbClient = unknown,
> = {
  type: ConnectorType;
  query<Result extends QueryResultRow = QueryResultRow>(
    client: DbClient,
    sql: SQL,
  ): Promise<QueryResult<Result>>;
};

export type WithSQLExecutor = {
  execute: {
    query<Result extends QueryResultRow = QueryResultRow>(
      sql: SQL,
    ): Promise<QueryResult<Result>>;
  };
};

export const withSqlExecutor = <
  DbClient = unknown,
  Executor extends SQLExecutor = SQLExecutor,
>(
  sqlExecutor: Executor,
  options: {
    connect: () => Promise<DbClient>;
    close?: (client: DbClient, error?: unknown) => Promise<void>;
  },
): WithSQLExecutor => ({
  execute: {
    query: async <Result extends QueryResultRow = QueryResultRow>(sql: SQL) => {
      const { connect, close } = options;
      const client = await connect();

      try {
        const result = await sqlExecutor.query<Result>(client, sql);
        if (close) await close(client);
        return result;
      } catch (error) {
        if (close) await close(client, error);

        throw error;
      }
    },
  },
});

export const queryWithNewConnection = async <
  ConnectionType extends Connection,
  Result extends QueryResultRow = QueryResultRow,
>(
  connectionFactory: {
    open: () => Promise<ConnectionType>;
  },
  sql: SQL,
) => {
  const { open } = connectionFactory;
  const connection = await open();

  try {
    return await connection.execute.query<Result>(sql);
  } finally {
    await connection.close();
  }
};
