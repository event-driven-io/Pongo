import type { SQLiteDriverType } from '..';
import {
  mapSQLQueryResult,
  SQL,
  SQLFormatter,
  tracer,
  type DbSQLExecutor,
  type QueryResult,
  type QueryResultRow,
  type SQLCommandOptions,
  type SQLQueryOptions,
} from '../../../../core';
import type { SQLiteClient } from '../connections';
import { sqliteFormatter } from '../sql/formatter';

export const sqliteExecute = async <Result = void>(
  database: SQLiteClient,
  handle: (client: SQLiteClient) => Promise<Result>,
) => {
  try {
    return await handle(database);
  } finally {
    await database.close();
  }
};

export type SQLiteSQLExecutor<
  DriverType extends SQLiteDriverType = SQLiteDriverType,
> = DbSQLExecutor<DriverType, SQLiteClient>;

export const sqliteSQLExecutor = <
  DriverType extends SQLiteDriverType = SQLiteDriverType,
>(
  driverType: DriverType,
  formatter?: SQLFormatter,
): SQLiteSQLExecutor<DriverType> => ({
  driverType,
  query: async <Result extends QueryResultRow = QueryResultRow>(
    client: SQLiteClient,
    sql: SQL,
    options?: SQLQueryOptions,
  ): Promise<QueryResult<Result>> => {
    if (options?.timeoutMs) {
      await client.query(SQL`PRAGMA busy_timeout = ${options.timeoutMs}`);
    }

    tracer.info('db:sql:query', {
      query: (formatter ?? sqliteFormatter).format(sql).query,
      params: (formatter ?? sqliteFormatter).format(sql).params,
      debugSQL: (formatter ?? sqliteFormatter).describe(sql),
    });

    let result = await client.query<Result>(sql, options);

    if (options?.mapping) {
      result = {
        ...result,
        rows: result.rows.map((row) =>
          mapSQLQueryResult(row, options.mapping!),
        ),
      };
    }

    return result;
  },
  batchQuery: async <Result extends QueryResultRow = QueryResultRow>(
    client: SQLiteClient,
    sqls: SQL[],
    options?: SQLQueryOptions,
  ): Promise<QueryResult<Result>[]> => {
    if (options?.timeoutMs) {
      await client.query(SQL`PRAGMA busy_timeout = ${options.timeoutMs}`);
    }

    const results = await client.batchQuery<Result>(sqls, options);

    if (options?.mapping) {
      return results.map((result) => ({
        ...result,
        rows: result.rows.map((row) =>
          mapSQLQueryResult(row, options.mapping!),
        ),
      }));
    }

    return results;
  },
  command: async <Result extends QueryResultRow = QueryResultRow>(
    client: SQLiteClient,
    sql: SQL,
    options?: SQLCommandOptions,
  ): Promise<QueryResult<Result>> => {
    if (options?.timeoutMs) {
      await client.query(SQL`PRAGMA busy_timeout = ${options.timeoutMs}`);
    }

    tracer.info('db:sql:command', {
      query: (formatter ?? sqliteFormatter).format(sql).query,
      params: (formatter ?? sqliteFormatter).format(sql).params,
      debugSQL: (formatter ?? sqliteFormatter).describe(sql),
    });

    return await client.command<Result>(sql, options);
  },
  batchCommand: async <Result extends QueryResultRow = QueryResultRow>(
    client: SQLiteClient,
    sqls: SQL[],
    options?: SQLCommandOptions,
  ): Promise<QueryResult<Result>[]> => {
    if (options?.timeoutMs) {
      await client.query(SQL`PRAGMA busy_timeout = ${options.timeoutMs}`);
    }

    return await client.batchCommand<Result>(sqls, options);
  },
  formatter: formatter ?? sqliteFormatter,
});
