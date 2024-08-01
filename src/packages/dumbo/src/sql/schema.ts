import { sql, type SQL } from '.';
export * from './schema';

export const tableExistsSQL = (tableName: string): SQL =>
  sql(
    `
  SELECT EXISTS (
    SELECT FROM pg_tables
    WHERE tablename = %L
  ) AS exists;`,
    tableName,
  );

// export const tableExists = async (
//   pool: pg.Pool,
//   tableName: string,
// ): Promise<boolean> => exists(pool, tableExistsSQL(tableName));

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

// export const functionExists = async (
//   pool: pg.Pool,
//   functionName: string,
// ): Promise<boolean> => exists(pool, functionExistsSQL(functionName));
