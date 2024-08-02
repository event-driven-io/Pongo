import pg from 'pg';
import {
  type QueryResult,
  type QueryResultRow,
  type SQL,
  type SQLExecutor,
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

export type NodePostgresSQLExecutor = SQLExecutor<
  NodePostgresConnector,
  NodePostgresClient
>;

export const nodePostgresSQLExecutor = (): NodePostgresSQLExecutor => ({
  type: NodePostgresConnectorType,
  query: async <Result extends QueryResultRow = QueryResultRow>(
    client: NodePostgresClient,
    sql: SQL,
  ): Promise<QueryResult<Result>> => {
    const result = await client.query<Result>(sql);

    return { rowCount: result.rowCount, rows: result.rows };
  },
});
