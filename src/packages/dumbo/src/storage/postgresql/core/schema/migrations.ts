import {
  describeSQL,
  exists,
  JSONSerializer,
  type MigratorOptions,
  registerDefaultMigratorOptions,
  SQL,
} from '../../../../core';
import { AdvisoryLock } from '../locks';
import { pgFormatter } from '../sql';

export const DefaultPostgreSQLMigratorOptions: MigratorOptions = {
  lock: {
    databaseLock: AdvisoryLock,
  },
  migrationTableExists: (execute, table, options) =>
    exists(
      execute.query(
        SQL`SELECT to_regclass(${describeSQL(SQL`${table}`, pgFormatter, JSONSerializer)}) IS NOT NULL AS "exists"`,
        options,
      ),
    ),
};

registerDefaultMigratorOptions('PostgreSQL', DefaultPostgreSQLMigratorOptions);
