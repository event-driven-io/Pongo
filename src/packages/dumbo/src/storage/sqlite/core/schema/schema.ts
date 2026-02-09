import { exists, SQL, type SQLExecutor } from '../../../../core';
export * from './schema';

export const defaultSQLiteDatabase = ':memory:';

const tableExistsSQL = (tableName: string): SQL =>
  SQL`
  SELECT EXISTS (
    SELECT 1
    FROM sqlite_master
    WHERE type = 'table' AND name = ${tableName}
  ) AS "exists"
   `;

export const tableExists = async (
  execute: SQLExecutor,
  tableName: string,
): Promise<boolean> => exists(execute.query(tableExistsSQL(tableName)));
