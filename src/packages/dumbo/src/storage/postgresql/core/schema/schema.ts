import { exists, SQL, type SQLExecutor } from '../../../../core';
export * from './schema';

export const defaultPostgreSqlDatabase = 'postgres';

export const tableExistsSQL = (tableName: string): SQL =>
  SQL`
  SELECT EXISTS (
    SELECT FROM pg_tables
    WHERE tablename = ${tableName}
  ) AS exists;`;

export const tableExists = async (
  execute: SQLExecutor,
  tableName: string,
): Promise<boolean> => exists(execute.query(tableExistsSQL(tableName)));

export const functionExistsSQL = (functionName: string): SQL =>
  SQL`
      SELECT EXISTS (
        SELECT FROM pg_proc
        WHERE
        proname = ${functionName}
      ) AS exists;`;

export const functionExists = async (
  execute: SQLExecutor,
  functionName: string,
): Promise<boolean> => exists(execute.query(functionExistsSQL(functionName)));
