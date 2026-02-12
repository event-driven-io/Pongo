import type { SQLiteDriverType } from '..';
import type { JSONSerializer, SQLFormatter, SQL } from '../../../../core';
import {
  mapSQLQueryResult,
  tracer,
  type BatchSQLCommandOptions,
  type DbSQLExecutor,
  type QueryResult,
  type QueryResultRow,
  type SQLCommandOptions,
  type SQLQueryOptions,
} from '../../../../core';
import type { DumboError } from '../../../../core/errors';
import type { SQLiteClient } from '../connections';
import { mapSqliteError } from '../errors/errorMapper';
import { sqliteFormatter } from '../sql/formatter';

export type SQLiteErrorMapper = (error: unknown) => DumboError;

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
  serializer: JSONSerializer,
  formatter?: SQLFormatter,
  errorMapper?: SQLiteErrorMapper,
): SQLiteSQLExecutor<DriverType> => ({
  driverType,
  query: async <Result extends QueryResultRow = QueryResultRow>(
    client: SQLiteClient,
    sql: SQL,
    options?: SQLQueryOptions,
  ): Promise<QueryResult<Result>> => {
    tracer.info('db:sql:query', {
      query: (formatter ?? sqliteFormatter).format(sql, { serializer }).query,
      params: (formatter ?? sqliteFormatter).format(sql, { serializer }).params,
      debugSQL: (formatter ?? sqliteFormatter).describe(sql, { serializer }),
    });

    try {
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
    } catch (error) {
      tracer.error('db:sql:query:execute:error', { error });
      throw (errorMapper ?? mapSqliteError)(error);
    }
  },
  batchQuery: async <Result extends QueryResultRow = QueryResultRow>(
    client: SQLiteClient,
    sqls: SQL[],
    options?: SQLQueryOptions,
  ): Promise<QueryResult<Result>[]> => {
    try {
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
    } catch (error) {
      tracer.error('db:sql:batch_query:execute:error', { error });
      throw (errorMapper ?? mapSqliteError)(error);
    }
  },
  command: async <Result extends QueryResultRow = QueryResultRow>(
    client: SQLiteClient,
    sql: SQL,
    options?: SQLCommandOptions,
  ): Promise<QueryResult<Result>> => {
    tracer.info('db:sql:command', {
      query: (formatter ?? sqliteFormatter).format(sql, { serializer }).query,
      params: (formatter ?? sqliteFormatter).format(sql, { serializer }).params,
      debugSQL: (formatter ?? sqliteFormatter).describe(sql, { serializer }),
    });

    try {
      return await client.command<Result>(sql, options);
    } catch (error) {
      tracer.error('db:sql:command:execute:error', { error });
      throw (errorMapper ?? mapSqliteError)(error);
    }
  },
  batchCommand: async <Result extends QueryResultRow = QueryResultRow>(
    client: SQLiteClient,
    sqls: SQL[],
    options?: BatchSQLCommandOptions,
  ): Promise<QueryResult<Result>[]> => {
    try {
      return await client.batchCommand<Result>(sqls, options);
    } catch (error) {
      tracer.error('db:sql:batch_command:execute:error', { error });
      throw (errorMapper ?? mapSqliteError)(error);
    }
  },
  formatter: formatter ?? sqliteFormatter,
});
