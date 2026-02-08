import {
  dumboDatabaseMetadataRegistry,
  exists,
  SQL,
  type DatabaseMetadata,
  type SQLExecutor,
} from '../../../../core';
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

export const sqliteMetadata: DatabaseMetadata = {
  databaseType: 'SQLite',
  defaultDatabase: ':memory:',
  capabilities: { supportsSchemas: false, supportsFunctions: false },
  tableExists,
  getDatabaseNameOrDefault: (connectionString?: string) =>
    connectionString || ':memory:',
};

dumboDatabaseMetadataRegistry.register('SQLite', sqliteMetadata);
