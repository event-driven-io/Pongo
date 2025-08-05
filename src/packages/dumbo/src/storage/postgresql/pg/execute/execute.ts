import pg from 'pg';
import {
  tracer,
  type DbSQLExecutor,
  type QueryResult,
  type QueryResultRow,
  type SQL,
} from '../../../../core';
import { pgFormatter } from '../../core';
import {
  NodePostgresConnectorType,
  type NodePostgresClientOrPoolClient,
  type NodePostgresConnector,
} from '../connections';

export const isNodePostgresNativePool = (
  poolOrClient: pg.Pool | pg.PoolClient | pg.Client,
): poolOrClient is pg.Pool => {
  return poolOrClient instanceof pg.Pool;
};

export const isNodePostgresClient = (
  poolOrClient: pg.Pool | pg.PoolClient | pg.Client,
): poolOrClient is pg.Client => poolOrClient instanceof pg.Client;

export const isNodePostgresPoolClient = (
  poolOrClient: pg.Pool | pg.PoolClient | pg.Client,
): poolOrClient is pg.PoolClient =>
  'release' in poolOrClient && typeof poolOrClient.release === 'function';

export const nodePostgresExecute = async <Result = void>(
  poolOrClient: pg.Pool | pg.PoolClient | pg.Client,
  handle: (client: pg.PoolClient | pg.Client) => Promise<Result>,
) => {
  const client = isNodePostgresNativePool(poolOrClient)
    ? await poolOrClient.connect()
    : poolOrClient;

  try {
    return await handle(client);
  } finally {
    // release only if client wasn't injected externally
    if (
      isNodePostgresNativePool(poolOrClient) &&
      isNodePostgresPoolClient(client)
    )
      client.release();
  }
};

export type NodePostgresSQLExecutor = DbSQLExecutor<
  NodePostgresConnector,
  NodePostgresClientOrPoolClient
>;

export const nodePostgresSQLExecutor = (): NodePostgresSQLExecutor => ({
  connector: NodePostgresConnectorType,
  query: batch,
  batchQuery: batch,
  command: batch,
  batchCommand: batch,
});

export type BatchQueryOptions = { timeoutMs?: number };

function batch<Result extends QueryResultRow = QueryResultRow>(
  client: NodePostgresClientOrPoolClient,
  sqlOrSqls: SQL,
  options?: BatchQueryOptions,
): Promise<QueryResult<Result>>;
function batch<Result extends QueryResultRow = QueryResultRow>(
  client: NodePostgresClientOrPoolClient,
  sqlOrSqls: SQL[],
  options?: BatchQueryOptions,
): Promise<QueryResult<Result>[]>;
async function batch<Result extends QueryResultRow = QueryResultRow>(
  client: NodePostgresClientOrPoolClient,
  sqlOrSqls: SQL | SQL[],
  options?: BatchQueryOptions,
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
    tracer.info('db:sql:query', { sql: sqls[i]! });
    //console.log(pgFormatter.format(sqls[i]!));
    const result = await client.query<Result>(pgFormatter.format(sqls[i]!));
    results[i] = { rowCount: result.rowCount, rows: result.rows };
  }
  return Array.isArray(sqlOrSqls) ? results : results[0]!;
}
