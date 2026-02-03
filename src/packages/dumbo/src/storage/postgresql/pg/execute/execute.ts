import pg from 'pg';
import {
  mapSQLQueryResult,
  tracer,
  type DbSQLExecutor,
  type QueryResult,
  type QueryResultRow,
  type SQL,
  type SQLCommandOptions,
  type SQLQueryOptions,
} from '../../../../core';
import { pgFormatter } from '../../core';
import { PgDriverType, type PgClientOrPoolClient } from '../connections';

export const isPgNativePool = (
  poolOrClient: pg.Pool | pg.PoolClient | pg.Client,
): poolOrClient is pg.Pool => {
  return poolOrClient instanceof pg.Pool;
};

export const isPgClient = (
  poolOrClient: pg.Pool | pg.PoolClient | pg.Client,
): poolOrClient is pg.Client => poolOrClient instanceof pg.Client;

export const isPgPoolClient = (
  poolOrClient: pg.Pool | pg.PoolClient | pg.Client,
): poolOrClient is pg.PoolClient =>
  'release' in poolOrClient && typeof poolOrClient.release === 'function';

export const pgExecute = async <Result = void>(
  poolOrClient: pg.Pool | pg.PoolClient | pg.Client,
  handle: (client: pg.PoolClient | pg.Client) => Promise<Result>,
) => {
  const client = isPgNativePool(poolOrClient)
    ? await poolOrClient.connect()
    : poolOrClient;

  try {
    return await handle(client);
  } finally {
    // release only if client wasn't injected externally
    if (isPgNativePool(poolOrClient) && isPgPoolClient(client))
      client.release();
  }
};

export type PgSQLExecutor = DbSQLExecutor<PgDriverType, PgClientOrPoolClient>;

export const pgSQLExecutor = (): PgSQLExecutor => ({
  driverType: PgDriverType,
  query: batch,
  batchQuery: batch,
  command: batch,
  batchCommand: batch,
  formatter: pgFormatter,
});

function batch<Result extends QueryResultRow = QueryResultRow>(
  client: PgClientOrPoolClient,
  sqlOrSqls: SQL,
  options?: SQLQueryOptions | SQLCommandOptions,
): Promise<QueryResult<Result>>;
function batch<Result extends QueryResultRow = QueryResultRow>(
  client: PgClientOrPoolClient,
  sqlOrSqls: SQL[],
  options?: SQLQueryOptions | SQLCommandOptions,
): Promise<QueryResult<Result>[]>;
async function batch<Result extends QueryResultRow = QueryResultRow>(
  client: PgClientOrPoolClient,
  sqlOrSqls: SQL | SQL[],
  options?: SQLQueryOptions | SQLCommandOptions,
): Promise<QueryResult<Result> | QueryResult<Result>[]> {
  const sqls = Array.isArray(sqlOrSqls) ? sqlOrSqls : [sqlOrSqls];
  const results: QueryResult<Result>[] = Array<QueryResult<Result>>(
    sqls.length,
  );

  if (options?.timeoutMs) {
    await client.query(`SET statement_timeout = ${options?.timeoutMs}`);
  }

  //TODO: make it smarter at some point
  for (let i = 0; i < sqls.length; i++) {
    const { query, params } = pgFormatter.format(sqls[i]!);
    tracer.info('db:sql:query', {
      query,
      params,
      debugSQL: pgFormatter.describe(sqls[i]!),
    });
    let result =
      params.length > 0
        ? await client.query<Result>(query, params)
        : await client.query<Result>(query);

    if (options?.mapping) {
      result = {
        ...result,
        rows: result.rows.map((row) =>
          mapSQLQueryResult(row, options.mapping!),
        ),
      };
    }

    results[i] = { rowCount: result.rowCount, rows: result.rows };
  }
  return Array.isArray(sqlOrSqls) ? results : results[0]!;
}
