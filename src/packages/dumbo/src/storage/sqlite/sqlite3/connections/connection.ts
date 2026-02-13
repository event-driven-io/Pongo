import sqlite3 from 'sqlite3';
import type { JSONSerializer } from '../../../../core';
import {
  BatchCommandNoChangesError,
  SQL,
  type Connection,
  type QueryResult,
  type QueryResultRow,
  type SQLQueryOptions,
} from '../../../../core';
import type {
  SQLiteClient,
  SQLiteClientOrPoolClient,
  SQLiteConnectionOptions,
  SQLiteDriverType,
  SQLiteFileNameOrConnectionString,
  SQLiteTransaction,
  SQLiteTransactionOptions,
} from '../../core';
import {
  InMemorySQLiteDatabase,
  sqliteConnection,
  type BatchSQLiteCommandOptions,
  type SQLiteClientOptions,
  type SQLiteCommandOptions,
  type SQLiteParameters,
} from '../../core/connections';
import { sqliteFormatter } from '../../core/sql/formatter';

export type SQLite3DriverType = SQLiteDriverType<'sqlite3'>;
export const SQLite3DriverType: SQLite3DriverType = 'SQLite:sqlite3';

export type ConnectionCheckResult =
  | { successful: true }
  | {
      successful: false;
      code: string | undefined;
      errorType: 'ConnectionRefused' | 'Authentication' | 'Unknown';
      error: unknown;
    };

export type SQLite3ClientOptions = SQLiteClientOptions &
  SQLiteFileNameOrConnectionString;

export type SQLite3Client = SQLiteClientOrPoolClient;

export type SQLite3ConnectionOptions = SQLiteConnectionOptions &
  ((SQLite3ClientOptions & { client?: never }) | { client: SQLite3Client });

export type SQLite3Connection<
  ClientType extends SQLiteClientOrPoolClient = SQLiteClientOrPoolClient,
> = Connection<
  SQLite3Connection,
  SQLite3DriverType,
  ClientType,
  SQLiteTransaction<SQLite3Connection>,
  SQLiteTransactionOptions
>;

export const sqlite3Client = (
  options: SQLite3ClientOptions & {
    serializer: JSONSerializer;
  },
): SQLiteClient => {
  let db: sqlite3.Database;

  let isClosed = false;

  const { serializer } = options;

  const connect: () => Promise<void> = () =>
    db
      ? Promise.resolve() // If db is already initialized, resolve immediately
      : new Promise((resolve, reject) => {
          try {
            db = new sqlite3.Database(
              options.fileName ??
                options.connectionString ??
                InMemorySQLiteDatabase,
              sqlite3.OPEN_URI | sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
              (err) => {
                if (err) {
                  reject(err);
                  return;
                }
              },
            );
            db.run('PRAGMA journal_mode = WAL;', (err) => {
              if (err) {
                reject(err);
                return;
              }

              resolve();
            });
          } catch (error) {
            reject(error as Error);
          }
        });

  const executeQuery = <T>(
    sql: string,
    params?: SQLiteParameters[],
  ): Promise<T[]> =>
    new Promise((resolve, reject) => {
      try {
        db.all(sql, params ?? [], (err: Error | null, result: T[]) => {
          if (err) {
            reject(err);
            return;
          }

          resolve(result);
        });
      } catch (error) {
        reject(error as Error);
      }
    });

  const executeCommand = <Result extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: SQLiteParameters[],
    options?: SQLiteCommandOptions,
  ): Promise<QueryResult<Result>> =>
    new Promise((resolve, reject) => {
      try {
        if (options?.ignoreChangesCount === true) {
          db.run(
            sql,
            params ?? [],
            function (err: Error | null, rows: Result[]) {
              if (err) {
                reject(err);
                return;
              }
              resolve({
                rowCount: 0,
                rows: rows ?? [],
              });
            },
          );
        }
        // OD: 2026-01-21
        // This is needed as SQLite does not return changes count properly
        // We need to query it separately with SELECT changes()
        // This may be fixed eventually in sqlite3 library as Node.js team did here:
        // https://github.com/nodejs/node/issues/57344
        // But for now, we do it manually, as a workaround
        // We also serialize it to avoid race conditions
        db.serialize(() => {
          db.all(sql, params ?? [], (err: Error | null, rows: Result[]) => {
            if (err) {
              reject(err);
              return;
            }
            db.get(
              'SELECT changes() as changes',
              (changesErr: Error | null, row: { changes: number } | null) => {
                if (changesErr) {
                  reject(changesErr);
                  return;
                }
                resolve({
                  rowCount: row?.changes ?? 0,
                  rows: rows ?? [],
                });
              },
            );
          });
        });
      } catch (error) {
        reject(error as Error);
      }
    });

  return {
    connect,
    close: (): Promise<void> => {
      if (isClosed) {
        return Promise.resolve();
      }
      isClosed = true;
      if (db)
        return new Promise((resolve, reject) => {
          db.close((err: Error | null) => {
            if (err) {
              reject(err);
              return;
            }

            resolve();
          });
        });
      return Promise.resolve();
    },
    query: async <Result extends QueryResultRow = QueryResultRow>(
      sql: SQL,
      _options?: SQLQueryOptions,
    ): Promise<QueryResult<Result>> => {
      const { query, params } = sqliteFormatter.format(sql, {
        serializer,
      });
      const result = await executeQuery<Result>(
        query,
        params as SQLiteParameters[],
      );
      return { rowCount: result.length, rows: result };
    },
    batchQuery: async <Result extends QueryResultRow = QueryResultRow>(
      sqls: SQL[],
      _options?: SQLQueryOptions,
    ): Promise<QueryResult<Result>[]> => {
      const results: QueryResult<Result>[] = [];
      for (const sql of sqls) {
        const { query, params } = sqliteFormatter.format(sql, {
          serializer,
        });
        const result = await executeQuery<Result>(
          query,
          params as SQLiteParameters[],
        );
        results.push({ rowCount: result.length, rows: result });
      }
      return results;
    },
    command: async <Result extends QueryResultRow = QueryResultRow>(
      sql: SQL,
      options?: SQLiteCommandOptions,
    ): Promise<QueryResult<Result>> => {
      const { query, params } = sqliteFormatter.format(sql, {
        serializer,
      });

      return executeCommand<Result>(
        query,
        params as SQLiteParameters[],
        options,
      );
    },
    batchCommand: async <Result extends QueryResultRow = QueryResultRow>(
      sqls: SQL[],
      options?: BatchSQLiteCommandOptions,
    ): Promise<QueryResult<Result>[]> => {
      const results: QueryResult<Result>[] = [];

      for (let i = 0; i < sqls.length; i++) {
        const { query, params } = sqliteFormatter.format(sqls[i]!, {
          serializer,
        });
        const result = await executeCommand<Result>(
          query,
          params as SQLiteParameters[],
          options,
        );
        results.push(result);

        if (options?.assertChanges && (result.rowCount ?? 0) === 0) {
          throw new BatchCommandNoChangesError(i);
        }
      }
      return results;
    },
  };
};

export const checkConnection = async (
  fileName: string,
  serializer: JSONSerializer,
): Promise<ConnectionCheckResult> => {
  const client = sqlite3Client({
    fileName,
    serializer,
  });

  try {
    await client.query(SQL`SELECT 1`);
    return { successful: true };
  } catch (error) {
    const code =
      error instanceof Error &&
      'code' in error &&
      typeof error.code === 'string'
        ? error.code
        : undefined;

    return {
      successful: false,
      errorType:
        code === 'SQLITE_CANTOPEN'
          ? 'ConnectionRefused'
          : code === 'SQLITE_AUTH'
            ? 'Authentication'
            : 'Unknown',
      code,
      error,
    };
  } finally {
    await client.close();
  }
};

export const sqlite3Connection = (
  options: SQLite3ConnectionOptions & { serializer: JSONSerializer },
) =>
  sqliteConnection<SQLite3Connection, SQLite3ConnectionOptions>({
    type: 'Client',
    driverType: SQLite3DriverType,
    sqliteClientFactory: (connectionOptions) => {
      if ('client' in connectionOptions && connectionOptions.client) {
        return connectionOptions.client;
      }
      return sqlite3Client({
        ...connectionOptions,
        serializer: options.serializer,
      });
    },
    connectionOptions: options,
    serializer: options.serializer,
  });
