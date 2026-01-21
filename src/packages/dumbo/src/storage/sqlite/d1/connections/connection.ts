import { D1DatabaseSession, type D1Database } from '@cloudflare/workers-types';
import {
  SQL,
  type QueryResult,
  type QueryResultRow,
  type SQLCommandOptions,
  type SQLQueryOptions,
} from '../../../../core';
import {
  sqliteAmbientClientConnection,
  type SQLiteClient,
  type SQLiteConnection,
  type SQLiteConnectionOptions,
  type SQLiteDriverType,
} from '../../core';
import { sqliteFormatter } from '../../core/sql/formatter';

export type D1DriverType = SQLiteDriverType<'d1'>;
export const D1DriverType: D1DriverType = 'SQLite:d1';

export type D1DatabaseOrSession = D1Database | D1DatabaseSession;

export type D1ClientOptions = {
  database: D1Database;
  session?: D1DatabaseSession | undefined;
};

export type D1Client = SQLiteClient & {
  database: D1Database;
  session?: D1DatabaseSession | undefined;
};

export type D1Connection = SQLiteConnection<D1DriverType, D1Client>;

export const d1Client = (options: D1ClientOptions): D1Client => {
  const { database, session } = options;

  const execute = session ?? database;

  return {
    database,
    session,
    connect: () => Promise.resolve(),
    close: () => Promise.resolve(),

    query: async <Result extends QueryResultRow = QueryResultRow>(
      sql: SQL,
      _options?: SQLQueryOptions,
    ): Promise<QueryResult<Result>> => {
      const { query, params } = sqliteFormatter.format(sql);
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
        const { query, params } = sqliteFormatter.format(sql);
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
      const { query, params } = sqliteFormatter.format(sql);
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
      _options?: SQLCommandOptions,
    ): Promise<QueryResult<Result>[]> => {
      const statements = sqls.map((sql) => {
        const { query, params } = sqliteFormatter.format(sql);
        const stmt = execute.prepare(query);
        return params?.length ? stmt.bind(...params) : stmt;
      });
      const results = await execute.batch<Result>(statements);
      return results.map((result) => ({
        rowCount: result.meta?.changes ?? 0,
        rows: result.results ?? [],
      }));
    },
  };
};

export type D1ConnectionOptions = SQLiteConnectionOptions & D1ClientOptions;

export const d1Connection = (options: D1ConnectionOptions) =>
  sqliteAmbientClientConnection<D1Connection>({
    driverType: D1DriverType,
    client: d1Client(options),
  });
