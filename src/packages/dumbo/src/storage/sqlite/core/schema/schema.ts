import { exists, SQL, type ConnectionPool } from '../../../../core';
export * from './schema';

export const defaultPostgreSqlDatabase = 'postgres';

export const tableExistsSQL = (tableName: string): SQL =>
  SQL`
  SELECT EXISTS (
    SELECT 1
    FROM sqlite_master
    WHERE type = 'table' AND name = ${tableName}
  ) AS "exists"
   `;

export const tableExists = async (
  pool: ConnectionPool,
  tableName: string,
): Promise<boolean> => exists(pool.execute.query(tableExistsSQL(tableName)));
