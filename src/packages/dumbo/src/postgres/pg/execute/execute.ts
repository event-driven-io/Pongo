import pg from 'pg';
import {
  type DbSQLExecutor,
  type QueryResult,
  type QueryResultRow,
  type SQL,
} from '../../../core';
import {
  NodePostgresConnectorType,
  type NodePostgresClient,
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
  NodePostgresClient
>;

export const nodePostgresSQLExecutor = (): NodePostgresSQLExecutor => ({
  type: NodePostgresConnectorType,
  query: batch,
  batchQuery: batch,
  command: batch,
  batchCommand: batch,
});

function batch<Result extends QueryResultRow = QueryResultRow>(
  client: NodePostgresClient,
  sqlOrSqls: SQL,
): Promise<QueryResult<Result>>;
function batch<Result extends QueryResultRow = QueryResultRow>(
  client: NodePostgresClient,
  sqlOrSqls: SQL[],
): Promise<QueryResult<Result>[]>;
async function batch<Result extends QueryResultRow = QueryResultRow>(
  client: NodePostgresClient,
  sqlOrSqls: SQL | SQL[],
): Promise<QueryResult<Result> | QueryResult<Result>[]> {
  const sqls = Array.isArray(sqlOrSqls) ? sqlOrSqls : [sqlOrSqls];
  const results: QueryResult<Result>[] = Array<QueryResult<Result>>(
    sqls.length,
  );
  //TODO: make it smarter at some point
  for (let i = 0; i < sqls.length; i++) {
    const result = await client.query<Result>(sqls[i]!);
    results[i] = { rowCount: result.rowCount, rows: result.rows };
  }
  return Array.isArray(sqlOrSqls) ? results : results[0]!;
}
