import {
  exists,
  registerDefaultMigratorOptions,
  type MigratorOptions,
} from '../../../../core';
import { tableExistsSQL } from './schema';
import { sqliteTableName } from './sqlitePhysicalNames';

export const DefaultSQLiteMigratorOptions: MigratorOptions = {
  migrationTableExists: (execute, table, options) =>
    exists(execute.query(tableExistsSQL(sqliteTableName(table)), options)),
};

registerDefaultMigratorOptions('SQLite', DefaultSQLiteMigratorOptions);
