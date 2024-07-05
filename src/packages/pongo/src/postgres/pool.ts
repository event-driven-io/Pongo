import pg from 'pg';

const pools: Map<string, pg.Pool> = new Map();

export const getPool = (
  connectionStringOrOptions: string | pg.PoolConfig,
): pg.Pool => {
  const connectionString =
    typeof connectionStringOrOptions === 'string'
      ? connectionStringOrOptions
      : connectionStringOrOptions.connectionString!;

  const poolOptions =
    typeof connectionStringOrOptions === 'string'
      ? { connectionString }
      : connectionStringOrOptions;

  return (
    pools.get(connectionString) ??
    pools.set(connectionString, new pg.Pool(poolOptions)).get(connectionString)!
  );
};

export const endPool = async (connectionString: string): Promise<void> => {
  const pool = pools.get(connectionString);
  if (pool) {
    await pool.end();
    pools.delete(connectionString);
  }
};

export const endAllPools = () =>
  Promise.all(
    [...pools.keys()].map((connectionString) => endPool(connectionString)),
  );
