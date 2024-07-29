import pg from 'pg';
import type { SQL } from '../sql';

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

export const executeInTransaction = async <Result = void>(
  poolOrClient: pg.Pool | pg.PoolClient | pg.Client,
  handle: (
    client: pg.PoolClient | pg.Client,
  ) => Promise<{ success: boolean; result: Result }>,
): Promise<Result> =>
  execute(poolOrClient, async (client) => {
    try {
      await client.query('BEGIN');

      const { success, result } = await handle(client);

      if (success) await client.query('COMMIT');
      else await client.query('ROLLBACK');

      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  });

export const executeSQL = async <
  Result extends pg.QueryResultRow = pg.QueryResultRow,
>(
  poolOrClient: pg.Pool | pg.PoolClient | pg.Client,
  sql: SQL,
): Promise<pg.QueryResult<Result>> =>
  execute(poolOrClient, (client) => client.query<Result>(sql));

export const executeSQLInTransaction = async <
  Result extends pg.QueryResultRow = pg.QueryResultRow,
>(
  pool: pg.Pool | pg.PoolClient | pg.Client,
  sql: SQL,
) => {
  console.log(sql);
  return executeInTransaction(pool, async (client) => ({
    success: true,
    result: await client.query<Result>(sql),
  }));
};

export const executeSQLBatchInTransaction = async <
  Result extends pg.QueryResultRow = pg.QueryResultRow,
>(
  pool: pg.Pool | pg.PoolClient | pg.Client,
  ...sqls: SQL[]
) =>
  executeInTransaction(pool, async (client) => {
    for (const sql of sqls) {
      await client.query<Result>(sql);
    }

    return { success: true, result: undefined };
  });

export const firstOrNull = async <
  Result extends pg.QueryResultRow = pg.QueryResultRow,
>(
  getResult: Promise<pg.QueryResult<Result>>,
): Promise<Result | null> => {
  const result = await getResult;

  return result.rows.length > 0 ? result.rows[0] ?? null : null;
};

export const first = async <
  Result extends pg.QueryResultRow = pg.QueryResultRow,
>(
  getResult: Promise<pg.QueryResult<Result>>,
): Promise<Result> => {
  const result = await getResult;

  if (result.rows.length === 0)
    throw new Error("Query didn't return any result");

  return result.rows[0]!;
};

export const singleOrNull = async <
  Result extends pg.QueryResultRow = pg.QueryResultRow,
>(
  getResult: Promise<pg.QueryResult<Result>>,
): Promise<Result | null> => {
  const result = await getResult;

  if (result.rows.length > 1) throw new Error('Query had more than one result');

  return result.rows.length > 0 ? result.rows[0] ?? null : null;
};

export const single = async <
  Result extends pg.QueryResultRow = pg.QueryResultRow,
>(
  getResult: Promise<pg.QueryResult<Result>>,
): Promise<Result> => {
  const result = await getResult;

  if (result.rows.length === 0)
    throw new Error("Query didn't return any result");

  if (result.rows.length > 1) throw new Error('Query had more than one result');

  return result.rows[0]!;
};

export const mapRows = async <
  Result extends pg.QueryResultRow = pg.QueryResultRow,
  Mapped = unknown,
>(
  getResult: Promise<pg.QueryResult<Result>>,
  map: (row: Result) => Mapped,
): Promise<Mapped[]> => {
  const result = await getResult;

  return result.rows.map(map);
};

export const toCamelCase = (snakeStr: string): string =>
  snakeStr.replace(/_([a-z])/g, (g) => g[1]?.toUpperCase() ?? '');

export const mapToCamelCase = <T extends Record<string, unknown>>(
  obj: T,
): T => {
  const newObj: Record<string, unknown> = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      newObj[toCamelCase(key)] = obj[key];
    }
  }
  return newObj as T;
};

export type ExistsSQLQueryResult = { exists: boolean };

export const exists = async (pool: pg.Pool, sql: SQL): Promise<boolean> => {
  const result = await single(executeSQL<ExistsSQLQueryResult>(pool, sql));

  return result.exists === true;
};
