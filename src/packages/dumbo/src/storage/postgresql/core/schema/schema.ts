import {
  exists,
  SQL,
  dumboDatabaseMetadataRegistry,
  type ConnectionPool,
  type DatabaseMetadata,
} from '../../../../core';
import { parseDatabaseName } from '../connections/connectionString';
export * from './schema';

export const defaultPostgreSqlDatabase = 'postgres';

export const tableExistsSQL = (tableName: string): SQL =>
  SQL`
  SELECT EXISTS (
    SELECT FROM pg_tables
    WHERE tablename = ${tableName}
  ) AS exists;`;

export const tableExists = async (
  pool: ConnectionPool,
  tableName: string,
): Promise<boolean> => exists(pool.execute.query(tableExistsSQL(tableName)));

export const functionExistsSQL = (functionName: string): SQL =>
  SQL`
      SELECT EXISTS (
        SELECT FROM pg_proc
        WHERE
        proname = ${functionName}
      ) AS exists;`;

export const functionExists = async (
  pool: ConnectionPool,
  functionName: string,
): Promise<boolean> =>
  exists(pool.execute.query(functionExistsSQL(functionName)));

export const postgreSQLMetadata: DatabaseMetadata = {
  databaseType: 'PostgreSQL',
  defaultDatabase: 'postgres',
  capabilities: { supportsSchemas: true, supportsFunctions: true },
  tableExists,
  functionExists,
  parseDatabaseName,
  getDatabaseNameOrDefault: (connectionString?: string) =>
    (connectionString ? parseDatabaseName(connectionString) : null) ??
    'postgres',
};

dumboDatabaseMetadataRegistry.register('PostgreSQL', postgreSQLMetadata);
