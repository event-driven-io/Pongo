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
import { mapD1Error } from '../errors/errorMapper';

export const d1SQLExecutor = (): DbSQLExecutor<D1DriverType, D1Client> => ({
  driverType: 'SQLite:d1',
  formatter: sqliteFormatter,

  query: async <Result extends QueryResultRow>(
    client: D1Client,
    sql: SQL,
    options?: SQLQueryOptions,
  ): Promise<QueryResult<Result>> => {
    try {
      return await client.query<Result>(sql, options);
    } catch (error) {
      throw mapD1Error(error);
    }
  },

  batchQuery: async <Result extends QueryResultRow>(
    client: D1Client,
    sqls: SQL[],
    options?: SQLQueryOptions,
  ): Promise<QueryResult<Result>[]> => {
    try {
      return await client.batchQuery<Result>(sqls, options);
    } catch (error) {
      throw mapD1Error(error);
    }
  },

  command: async <Result extends QueryResultRow>(
    client: D1Client,
    sql: SQL,
    options?: SQLCommandOptions,
  ): Promise<QueryResult<Result>> => {
    try {
      return await client.command<Result>(sql, options);
    } catch (error) {
      throw mapD1Error(error);
    }
  },

  batchCommand: async <Result extends QueryResultRow>(
    client: D1Client,
    sqls: SQL[],
    options?: BatchSQLCommandOptions,
  ): Promise<QueryResult<Result>[]> => {
    try {
      return await client.batchCommand<Result>(sqls, options);
    } catch (error) {
      throw mapD1Error(error);
    }
  },
});
