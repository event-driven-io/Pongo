import {
  registerDefaultMigratorOptions,
  type MigratorOptions,
} from '../../../../core';

export const DefaultSQLiteMigratorOptions: MigratorOptions = {};

registerDefaultMigratorOptions('SQLite', DefaultSQLiteMigratorOptions);
