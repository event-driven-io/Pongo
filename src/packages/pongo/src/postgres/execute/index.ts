import type pg from 'pg';
import format from 'pg-format';

export const sql = async <Result extends pg.QueryResultRow = pg.QueryResultRow>(
  pool: pg.Pool,
  sqlText: string,
  ...params: unknown[]
): Promise<pg.QueryResult<Result>> => {
  const client = await pool.connect();
  try {
    const query = format(sqlText, ...params);
    return await client.query<Result>(query);
  } finally {
    client.release();
  }
};

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
