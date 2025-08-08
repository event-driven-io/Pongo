import type { SQLiteConnectorType } from '..';
import {
  SQL,
  tracer,
  type DbSQLExecutor,
  type QueryResult,
  type QueryResultRow,
} from '../../../../core';
import type { SQLiteClient, Parameters } from '../connections';
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
  ConnectorType extends SQLiteConnectorType = SQLiteConnectorType,
> = DbSQLExecutor<ConnectorType, SQLiteClient>;

export const sqliteSQLExecutor = <
  ConnectorType extends SQLiteConnectorType = SQLiteConnectorType,
>(
  connector: ConnectorType,
): SQLiteSQLExecutor<ConnectorType> => ({
  connector,
  query: batch,
  batchQuery: batch,
  command: batch,
  batchCommand: batch,
});

export type BatchQueryOptions = { timeoutMs?: number };

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
    tracer.info('db:sql:query', { sql: sqls[i]! });

    const { query, params } = sqliteFormatter.format(sqls[i]!);
    const result = await client.query<Result>(query, params as Parameters[]);

    results[i] = { rowCount: result.length, rows: result };
  }
  return Array.isArray(sqlOrSqls) ? results : results[0]!;
}
