import { exists, type ConnectionPool } from '../../../core';
import { sql, type SQL } from '../../../core/sql';
export * from './schema';

export const defaultPostgreSqlDatabase = 'postgres';

export const tableExistsSQL = (tableName: string): SQL =>
  sql(
    `
  SELECT EXISTS (
    SELECT FROM pg_tables
    WHERE tablename = %L
  ) AS exists;`,
    tableName,
  );

export const tableExists = async (
  pool: ConnectionPool,
  tableName: string,
): Promise<boolean> => exists(pool.execute.query(tableExistsSQL(tableName)));

export const functionExistsSQL = (functionName: string): SQL =>
  sql(
    `
      SELECT EXISTS (
        SELECT FROM pg_proc 
        WHERE 
        proname = %L
      ) AS exists;
    `,
    functionName,
  );

export const functionExists = async (
  pool: ConnectionPool,
  tableName: string,
): Promise<boolean> => exists(pool.execute.query(functionExistsSQL(tableName)));
