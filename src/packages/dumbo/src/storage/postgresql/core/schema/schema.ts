import {
  exists,
  SQL,
  type SQLExecutor,
  type SQLQueryOptions,
} from '../../../../core';
export * from './schema';

export const defaultPostgreSqlDatabase = 'postgres';

const databaseSchemaNames = (databaseSchemaName: string | undefined): SQL =>
  databaseSchemaName === undefined
    ? SQL`current_schemas(false)`
    : SQL`ARRAY[${databaseSchemaName}::name]`;

export const schemaExistsSQL = (databaseSchemaName: string): SQL =>
  SQL`
  SELECT EXISTS (
    SELECT FROM pg_namespace
    WHERE nspname = ${databaseSchemaName}
  ) AS exists;`;

export const schemaExists = async (
  execute: SQLExecutor,
  databaseSchemaName: string,
  options?: SQLQueryOptions,
): Promise<boolean> =>
  exists(execute.query(schemaExistsSQL(databaseSchemaName), options));

export const tableExistsSQL = (
  tableName: string,
  options?: { databaseSchemaName?: string | undefined },
): SQL =>
  SQL`
  SELECT EXISTS (
    SELECT FROM pg_tables
    WHERE tablename = ${tableName}
      AND schemaname = ANY(${databaseSchemaNames(options?.databaseSchemaName)})
  ) AS exists;`;

export const tableExists = async (
  execute: SQLExecutor,
  tableName: string,
  options?: { databaseSchemaName?: string | undefined } & SQLQueryOptions,
): Promise<boolean> =>
  exists(execute.query(tableExistsSQL(tableName, options), options));

export const functionExistsSQL = (
  functionName: string,
  options?: { databaseSchemaName?: string | undefined },
): SQL =>
  SQL`
      SELECT EXISTS (
        SELECT FROM pg_proc
        JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
        WHERE
        proname = ${functionName}
        AND nspname = ANY(${databaseSchemaNames(options?.databaseSchemaName)})
      ) AS exists;`;

export const functionExists = async (
  execute: SQLExecutor,
  functionName: string,
  options?: { databaseSchemaName?: string | undefined } & SQLQueryOptions,
): Promise<boolean> =>
  exists(execute.query(functionExistsSQL(functionName, options), options));

export const indexExistsSQL = (
  indexName: string,
  options?: { databaseSchemaName?: string | undefined },
): SQL =>
  SQL`
  SELECT EXISTS (
    SELECT FROM pg_indexes
    WHERE indexname = ${indexName}
      AND schemaname = ANY(${databaseSchemaNames(options?.databaseSchemaName)})
  ) AS exists;`;

export const indexExists = async (
  execute: SQLExecutor,
  indexName: string,
  options?: { databaseSchemaName?: string | undefined } & SQLQueryOptions,
): Promise<boolean> =>
  exists(execute.query(indexExistsSQL(indexName, options), options));

export const sequenceExistsSQL = (
  sequenceName: string,
  options?: { databaseSchemaName?: string | undefined },
): SQL =>
  SQL`
  SELECT EXISTS (
    SELECT FROM pg_sequences
    WHERE sequencename = ${sequenceName}
      AND schemaname = ANY(${databaseSchemaNames(options?.databaseSchemaName)})
  ) AS exists;`;

export const sequenceExists = async (
  execute: SQLExecutor,
  sequenceName: string,
  options?: { databaseSchemaName?: string | undefined } & SQLQueryOptions,
): Promise<boolean> =>
  exists(execute.query(sequenceExistsSQL(sequenceName, options), options));
