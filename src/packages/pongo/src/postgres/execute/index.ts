import type pg from 'pg';
import type { SQL } from '../sql';

export const execute = async <Result = void>(
  pool: pg.Pool,
  handle: (client: pg.PoolClient) => Promise<Result>,
) => {
  const client = await pool.connect();
  try {
    return await handle(client);
  } finally {
    client.release();
  }
};

export const executeSQL = async <
  Result extends pg.QueryResultRow = pg.QueryResultRow,
>(
  pool: pg.Pool,
  sql: SQL,
): Promise<pg.QueryResult<Result>> =>
  execute(pool, (client) => client.query<Result>(sql));
