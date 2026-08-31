import type {
  DurableObjectStorage,
  SqlStorageValue,
} from '@cloudflare/workers-types';
import {
  BatchCommandNoChangesError,
  DataError,
  type BatchSQLCommandOptions,
  type JSONSerializer,
  type QueryResult,
  type QueryResultRow,
  type SQL,
  type SQLCommandOptions,
  type SQLQueryOptions,
} from '../../../../core';
import { sqliteFormatter, type SQLiteClient } from '../../core';

export type CloudflareDurableObjectSQLiteClientOptions = {
  storage: DurableObjectStorage;
  serializer: JSONSerializer;
};

export type CloudflareDurableObjectSQLiteClient = SQLiteClient & {
  storage: DurableObjectStorage;
};

const toStorageBindings = (params: unknown[] | undefined): SqlStorageValue[] =>
  (params ?? []).map((param) => {
    if (typeof param === 'boolean') return param ? 1 : 0;
    if (
      param === null ||
      typeof param === 'string' ||
      typeof param === 'number'
    ) {
      return param;
    }
    throw new DataError(
      `Unsupported Cloudflare Durable Object SQLite binding type: ${typeof param}`,
    );
  });

export const cloudflareDurableObjectSQLiteClient = (
  options: CloudflareDurableObjectSQLiteClientOptions,
): CloudflareDurableObjectSQLiteClient => {
  const { serializer, storage } = options;
  const { sql } = storage;

  const executeQuery = <Result extends QueryResultRow = QueryResultRow>(
    sqlStatement: SQL,
  ): QueryResult<Result> => {
    const { query, params } = sqliteFormatter.format(sqlStatement, {
      serializer,
    });
    const cursor = sql.exec<Result>(query, ...toStorageBindings(params));
    const rows = cursor.toArray();
    return { rowCount: rows.length, rows };
  };

  const executeCommand = <Result extends QueryResultRow = QueryResultRow>(
    sqlStatement: SQL,
  ): QueryResult<Result> => {
    const { query, params } = sqliteFormatter.format(sqlStatement, {
      serializer,
    });
    const { totalChanges: totalChangesBefore } = sql
      .exec<{ totalChanges: number }>('SELECT total_changes() AS totalChanges')
      .one();
    const rows = sql
      .exec<Result>(query, ...toStorageBindings(params))
      .toArray();
    const { changes, totalChanges: totalChangesAfter } = sql
      .exec<{ changes: number; totalChanges: number }>(
        'SELECT changes() AS changes, total_changes() AS totalChanges',
      )
      .one();
    return {
      rowCount: totalChangesAfter > totalChangesBefore ? changes : 0,
      rows,
    };
  };

  const executeBatchCommand = <Result extends QueryResultRow = QueryResultRow>(
    sqls: SQL[],
    options?: BatchSQLCommandOptions,
  ): QueryResult<Result>[] =>
    sqls.map((statement, index) => {
      const result = executeCommand<Result>(statement);

      if (options?.assertChanges && (result.rowCount ?? 0) === 0) {
        throw new BatchCommandNoChangesError(index);
      }

      return result;
    });

  return {
    storage,
    connect: () => Promise.resolve(),
    close: () => Promise.resolve(),
    query: <Result extends QueryResultRow = QueryResultRow>(
      sql: SQL,
      _options?: SQLQueryOptions,
    ): Promise<QueryResult<Result>> =>
      Promise.resolve().then(() => executeQuery<Result>(sql)),
    batchQuery: <Result extends QueryResultRow = QueryResultRow>(
      sqls: SQL[],
      _options?: SQLQueryOptions,
    ): Promise<QueryResult<Result>[]> =>
      Promise.resolve().then(() =>
        sqls.map((sql) => executeQuery<Result>(sql)),
      ),
    command: <Result extends QueryResultRow = QueryResultRow>(
      sql: SQL,
      _options?: SQLCommandOptions,
    ): Promise<QueryResult<Result>> =>
      Promise.resolve().then(() => executeCommand<Result>(sql)),
    batchCommand: async <Result extends QueryResultRow = QueryResultRow>(
      sqls: SQL[],
      options?: BatchSQLCommandOptions,
    ): Promise<QueryResult<Result>[]> => {
      return storage.transaction(() =>
        Promise.resolve(executeBatchCommand<Result>(sqls, options)),
      );
    },
  };
};
