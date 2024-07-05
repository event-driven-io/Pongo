import type { QueryResultRow, Pool, QueryResult, PoolClient } from 'pg';
import format from 'pg-format';

export const sql = async <Result extends QueryResultRow = QueryResultRow>(
  pool: Pool,
  sqlText: string,
  ...params: unknown[]
): Promise<QueryResult<Result>> => {
  const client = await pool.connect();
  try {
    const query = format(sqlText, ...params);
    return await client.query<Result>(query);
  } finally {
    client.release();
  }
};

export const execute = async <Result = void>(
  pool: Pool,
  handle: (client: PoolClient) => Promise<Result>,
) => {
  const client = await pool.connect();
  try {
    return await handle(client);
  } finally {
    client.release();
  }
};
