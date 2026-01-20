import type {
  DbSQLExecutor,
  QueryResult,
  QueryResultRow,
  SQL,
  SQLCommandOptions,
  SQLQueryOptions,
} from '../../../../core';
import { sqliteFormatter, type SQLiteParameters } from '../../core';
import type { D1Client, D1DriverType } from '../connections';

export const d1SQLExecutor = (
  driverType: D1DriverType,
): DbSQLExecutor<D1DriverType, D1Client> => ({
  driverType,
  formatter: sqliteFormatter,

  query: async <Result extends QueryResultRow>(
    client: D1Client,
    sql: SQL,
    _options?: SQLQueryOptions,
  ): Promise<QueryResult<Result>> => {
    const { query, params } = sqliteFormatter.format(sql);
    const result = await client.query<Result>(
      query,
      params as SQLiteParameters[],
    );
    return { rowCount: result.length, rows: result };
  },

  batchQuery: async <Result extends QueryResultRow>(
    client: D1Client,
    sqls: SQL[],
    _options?: SQLQueryOptions,
  ): Promise<QueryResult<Result>[]> => {
    // Use D1's native batch for true atomic execution
    const statements = sqls.map((sql) => {
      const { query, params } = sqliteFormatter.format(sql);
      const stmt = client.database.prepare(query);
      return params.length ? stmt.bind(...params) : stmt;
    });

    const batchResults = await client.database.batch(statements);

    return batchResults.map((r) => ({
      rowCount: r.results?.length ?? 0,
      rows: (r.results ?? []) as Result[],
    }));
  },

  command: async <Result extends QueryResultRow>(
    client: D1Client,
    sql: SQL,
    _options?: SQLCommandOptions,
  ): Promise<QueryResult<Result>> => {
    const { query, params } = sqliteFormatter.format(sql);
    await client.command(query, params as SQLiteParameters[]);
    return { rowCount: 0, rows: [] };
  },

  batchCommand: async <Result extends QueryResultRow>(
    client: D1Client,
    sqls: SQL[],
    _options?: SQLCommandOptions,
  ): Promise<QueryResult<Result>[]> => {
    const statements = sqls.map((sql) => {
      const { query, params } = sqliteFormatter.format(sql);
      const stmt = client.database.prepare(query);
      return params.length
        ? stmt.bind(...(params as SQLiteParameters[]))
        : stmt;
    });

    const batchResults = await client.database.batch(statements);

    return batchResults.map((r) => ({
      rowCount: r.meta?.changes ?? 0,
      rows: [],
    }));
  },
});
