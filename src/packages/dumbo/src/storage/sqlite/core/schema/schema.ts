import {
  exists,
  SQL,
  dumboDatabaseMetadataRegistry,
  type ConnectionPool,
  type DatabaseMetadata,
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
  pool: ConnectionPool,
  tableName: string,
): Promise<boolean> => exists(pool.execute.query(tableExistsSQL(tableName)));

export const sqliteMetadata: DatabaseMetadata = {
  databaseType: 'SQLite',
  defaultDatabase: ':memory:',
  capabilities: { supportsSchemas: false, supportsFunctions: false },
  tableExists,
  getDatabaseNameOrDefault: (connectionString?: string) =>
    connectionString || ':memory:',
};

dumboDatabaseMetadataRegistry.register('SQLite', sqliteMetadata);
