import type {
  BatchSQLCommandOptions,
  DbSQLExecutor,
  QueryResult,
  QueryResultRow,
  SQL,
  SQLCommandOptions,
  SQLQueryOptions,
} from '../../../../core';
import { sqliteFormatter } from '../../core';
import type { D1Client, D1DriverType } from '../connections';

export const d1SQLExecutor = (
  driverType: D1DriverType,
): DbSQLExecutor<D1DriverType, D1Client> => ({
  driverType,
  formatter: sqliteFormatter,

  query: async <Result extends QueryResultRow>(
    client: D1Client,
    sql: SQL,
    options?: SQLQueryOptions,
  ): Promise<QueryResult<Result>> => {
    return await client.query<Result>(sql, options);
  },

  batchQuery: async <Result extends QueryResultRow>(
    client: D1Client,
    sqls: SQL[],
    options?: SQLQueryOptions,
  ): Promise<QueryResult<Result>[]> => {
    return await client.batchQuery<Result>(sqls, options);
  },

  command: async <Result extends QueryResultRow>(
    client: D1Client,
    sql: SQL,
    options?: SQLCommandOptions,
  ): Promise<QueryResult<Result>> => {
    return await client.command<Result>(sql, options);
  },

  batchCommand: async <Result extends QueryResultRow>(
    client: D1Client,
    sqls: SQL[],
    options?: BatchSQLCommandOptions,
  ): Promise<QueryResult<Result>[]> => {
    return await client.batchCommand<Result>(sqls, options);
  },
});
