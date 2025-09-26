import type { SQLiteDriverType } from '..';
import {
  JSONSerializer,
  SQL,
  SQLFormatter,
  tracer,
  type DbSQLExecutor,
  type QueryResult,
  type QueryResultRow,
} from '../../../../core';
import type { Parameters, SQLiteClient } from '../connections';
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
  query: batch,
  batchQuery: batch,
  command: batch,
  batchCommand: batch,
  formatter: formatter ?? sqliteFormatter,
});

export type BatchQueryOptions = {
  timeoutMs?: number;
  mapping?: { resultColumnsToJson?: string[] };
};

function batch<Result extends QueryResultRow = QueryResultRow>(
  client: SQLiteClient,
  sqlOrSqls: SQL,
  options?: BatchQueryOptions,
): Promise<QueryResult<Result>>;
function batch<Result extends QueryResultRow = QueryResultRow>(
  client: SQLiteClient,
  sqlOrSqls: SQL[],
  options?: BatchQueryOptions,
): Promise<QueryResult<Result>[]>;
async function batch<Result extends QueryResultRow = QueryResultRow>(
  client: SQLiteClient,
  sqlOrSqls: SQL | SQL[],
  options?: BatchQueryOptions,
): Promise<QueryResult<Result> | QueryResult<Result>[]> {
  const sqls = Array.isArray(sqlOrSqls) ? sqlOrSqls : [sqlOrSqls];
  const results: QueryResult<Result>[] = Array<QueryResult<Result>>(
    sqls.length,
  );

  if (options?.timeoutMs) {
    // TODO: This is not precisely timeout
    // SQLite's busy_timeout determines how long SQLite will wait
    // when the database is locked before returning
    // a "database is locked" error
    await client.query(`PRAGMA busy_timeout = ${options?.timeoutMs}`);
  }

  //TODO: make it smarter at some point
  for (let i = 0; i < sqls.length; i++) {
    const { query, params } = sqliteFormatter.format(sqls[i]!);
    tracer.info('db:sql:query', {
      query,
      params,
      debugSQL: sqliteFormatter.describe(sqls[i]!),
    });

    let result = await client.query<Result>(query, params as Parameters[]);

    const columnsToJson = options?.mapping?.resultColumnsToJson;
    if (columnsToJson?.length) {
      result = result.map((row) => {
        let changed = false;
        const newRow = row as Record<string, unknown>;
        for (const col of columnsToJson) {
          const val = newRow[col];
          if (typeof val === 'string') {
            try {
              newRow[col] = JSONSerializer.deserialize(val);
              changed = true;
            } catch {
              // ignore parse errors
            }
          }
        }
        return changed ? (newRow as Result) : row;
      });
    }

    results[i] = { rowCount: result.length, rows: result };
  }
  return Array.isArray(sqlOrSqls) ? results : results[0]!;
}
