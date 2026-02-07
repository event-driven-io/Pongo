import type {
  D1Database,
  D1DatabaseSession,
  D1SessionBookmark,
  D1SessionConstraint,
} from '@cloudflare/workers-types';
import {
  BatchCommandNoChangesError,
  type BatchSQLCommandOptions,
  type JSONSerializer,
  type QueryResult,
  type QueryResultRow,
  type SQL,
  type SQLCommandOptions,
  type SQLQueryOptions,
} from '../../../../core';
import { sqliteFormatter, type SQLiteClient } from '../../core';

export type D1DatabaseOrSession = D1Database | D1DatabaseSession;

export type D1ClientOptions = {
  database: D1Database;
  session?: D1DatabaseSession | undefined;
  serializer: JSONSerializer;
};

export type D1SessionOptions = {
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  constraintOrBookmark?: D1SessionBookmark | D1SessionConstraint;
};

export type D1Client = SQLiteClient & {
  database: D1Database;
  session?: D1DatabaseSession | undefined;

  withSession: (constraintOrBookmark?: D1SessionOptions) => Promise<D1Client>;
};

export const d1Client = (options: D1ClientOptions): D1Client => {
  const { database, session, serializer } = options;

  const execute = session ?? database;

  return {
    database,
    session: session,
    connect: () => Promise.resolve(),
    close: () => Promise.resolve(),
    withSession: async (constraintOrBookmark?: D1SessionOptions) => {
      const newSession = constraintOrBookmark
        ? database.withSession(constraintOrBookmark as string)
        : database.withSession();

      return Promise.resolve(
        d1Client({
          database,
          session: newSession,
          serializer,
        }),
      );
    },

    query: async <Result extends QueryResultRow = QueryResultRow>(
      sql: SQL,
      _options?: SQLQueryOptions,
    ): Promise<QueryResult<Result>> => {
      const { query, params } = sqliteFormatter.format(sql, { serializer });
      const stmt = execute.prepare(query);
      const bound = params?.length ? stmt.bind(...params) : stmt;
      const { results } = await bound.all<Result>();
      return { rowCount: results?.length ?? 0, rows: results ?? [] };
    },

    batchQuery: async <Result extends QueryResultRow = QueryResultRow>(
      sqls: SQL[],
      _options?: SQLQueryOptions,
    ): Promise<QueryResult<Result>[]> => {
      const statements = sqls.map((sql) => {
        const { query, params } = sqliteFormatter.format(sql, { serializer });
        const stmt = execute.prepare(query);
        return params?.length ? stmt.bind(...params) : stmt;
      });
      const results = await execute.batch<Result>(statements);
      return results.map((result) => ({
        rowCount: result.results?.length ?? 0,
        rows: result.results ?? [],
      }));
    },

    command: async <Result extends QueryResultRow = QueryResultRow>(
      sql: SQL,
      _options?: SQLCommandOptions,
    ): Promise<QueryResult<Result>> => {
      const { query, params } = sqliteFormatter.format(sql, { serializer });
      const stmt = execute.prepare(query);
      const bound = params?.length ? stmt.bind(...params) : stmt;
      const result = await bound.run<Result>();
      return {
        rowCount: result.meta?.changes ?? 0,
        rows: result.results ?? [],
      };
    },

    batchCommand: async <Result extends QueryResultRow = QueryResultRow>(
      sqls: SQL[],
      options?: BatchSQLCommandOptions,
    ): Promise<QueryResult<Result>[]> => {
      const statements = sqls.map((sql) => {
        const { query, params } = sqliteFormatter.format(sql, { serializer });
        const stmt = execute.prepare(query);
        return params?.length ? stmt.bind(...params) : stmt;
      });
      const batchResults = await execute.batch<Result>(statements);

      return batchResults.map((result, i) => {
        const qr: QueryResult<Result> = {
          rowCount: result.meta?.changes ?? 0,
          rows: result.results ?? [],
        };

        if (options?.assertChanges && (qr.rowCount ?? 0) === 0) {
          throw new BatchCommandNoChangesError(i);
        }

        return qr;
      });
    },
  };
};
