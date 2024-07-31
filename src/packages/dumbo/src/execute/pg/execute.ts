import pg from 'pg';
import {
  NodePostgresConnectorType,
  type NodePostgresConnection,
} from '../../connections';
import type { SQL } from '../../sql';
import type { QueryResult, QueryResultRow, SQLExecutor } from '../execute';

export const isPgPool = (
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

export const execute = async <Result = void>(
  poolOrClient: pg.Pool | pg.PoolClient | pg.Client,
  handle: (client: pg.PoolClient | pg.Client) => Promise<Result>,
) => {
  const client = isPgPool(poolOrClient)
    ? await poolOrClient.connect()
    : poolOrClient;

  try {
    return await handle(client);
  } finally {
    // release only if client wasn't injected externally
    if (isPgPool(poolOrClient) && isPgPoolClient(client)) client.release();
  }
};

export type NodePostgresSQLExecutor = SQLExecutor<NodePostgresConnection>;

export const nodePostgresSQLExecutor = (): NodePostgresSQLExecutor => ({
  type: NodePostgresConnectorType,
  query: async <Result extends QueryResultRow = QueryResultRow>(
    client: Promise<pg.PoolClient> | Promise<pg.Client>,
    sql: SQL,
  ): Promise<QueryResult<Result>> => {
    const result = await (await client).query<Result>(sql);

    return { rowCount: result.rowCount, rows: result.rows };
  },
});
