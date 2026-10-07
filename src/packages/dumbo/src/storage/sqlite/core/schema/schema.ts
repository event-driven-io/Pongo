import {
  exists,
  SQL,
  type SQLExecutor,
  type SQLQueryOptions,
} from '../../../../core';
import { sqliteIndexName, sqliteTableName } from './sqlitePhysicalNames';
export * from './schema';

export const defaultSQLiteDatabase = ':memory:';

export const tableExistsSQL = (tableName: string): SQL =>
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
  options?: { databaseSchemaName?: string | undefined } & SQLQueryOptions,
): Promise<boolean> =>
  exists(
    execute.query(
      tableExistsSQL(
        options?.databaseSchemaName === undefined
          ? tableName
          : sqliteTableName({
              databaseSchemaName: options.databaseSchemaName,
              tableName,
            }),
      ),
      options,
    ),
  );

const columnExistsSQL = (tableName: string, columnName: string): SQL =>
  SQL`
  SELECT EXISTS (
    SELECT 1
    FROM pragma_table_info(${tableName})
    WHERE name = ${columnName}
  ) AS "exists"
   `;

export const columnExists = async (
  execute: SQLExecutor,
  tableName: string,
  columnName: string,
  options?: { databaseSchemaName?: string | undefined } & SQLQueryOptions,
): Promise<boolean> =>
  exists(
    execute.query(
      columnExistsSQL(
        options?.databaseSchemaName === undefined
          ? tableName
          : sqliteTableName({
              databaseSchemaName: options.databaseSchemaName,
              tableName,
            }),
        columnName,
      ),
      options,
    ),
  );

const indexExistsSQL = (indexName: string): SQL =>
  SQL`
  SELECT EXISTS (
    SELECT 1
    FROM sqlite_master
    WHERE type = 'index' AND name = ${indexName}
  ) AS "exists"
   `;

export const indexExists = async (
  execute: SQLExecutor,
  indexName: string,
  options?: { databaseSchemaName?: string | undefined } & SQLQueryOptions,
): Promise<boolean> =>
  exists(
    execute.query(
      indexExistsSQL(
        options?.databaseSchemaName === undefined
          ? indexName
          : sqliteIndexName({
              databaseSchemaName: options.databaseSchemaName,
              indexName,
            }),
      ),
      options,
    ),
  );
