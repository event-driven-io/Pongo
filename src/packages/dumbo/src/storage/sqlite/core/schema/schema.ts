import { exists, sql, type ConnectionPool, type SQL } from '../../../../core';
export * from './schema';

export const defaultPostgreSqlDatabase = 'postgres';

export const tableExistsSQL = (tableName: string): SQL =>
  sql(
    `SELECT 1
    FROM sqlite_master
    WHERE type = 'table' AND name = %L;`,
    tableName,
  );

export const tableExists = async (
  pool: ConnectionPool,
  tableName: string,
): Promise<boolean> => exists(pool.execute.query(tableExistsSQL(tableName)));
