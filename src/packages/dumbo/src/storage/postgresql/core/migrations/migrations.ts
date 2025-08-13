import {
  type DatabaseLockOptions,
  type MigratorOptions,
  type SchemaComponent,
  MIGRATIONS_LOCK_ID,
  SQL,
  schemaComponent,
  sqlMigration,
} from '../../../../core';
import { AdvisoryLock } from '../locks';

const migrationTableSQL = SQL`
  CREATE TABLE IF NOT EXISTS migrations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    application VARCHAR(255) NOT NULL DEFAULT 'default',
    sql_hash VARCHAR(64) NOT NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`;

export const migrationTableSchemaComponent = schemaComponent(
  'dumbo:schema-component:migrations-table',
  {
    migrations: () => [
      sqlMigration('dumbo:migrationTable:001', [migrationTableSQL]),
    ],
  },
);

export const DefaultPostgreSQLMigratorOptions: MigratorOptions = {
  schema: {
    migrationTable: migrationTableSchemaComponent,
  },
  lock: {
    databaseLock: AdvisoryLock,
    options: {
      lockId: MIGRATIONS_LOCK_ID,
    },
  },
};

export type PostgreSQLMigratorOptions = {
  schema?: Omit<SchemaComponent, 'migrationTable'>;
  lock?: {
    options?: Omit<DatabaseLockOptions, 'lockId'> &
      Partial<Pick<DatabaseLockOptions, 'lockId'>>;
  };
  dryRun?: boolean | undefined;
};

export const PostgreSQLMigratorOptions = (
  options?: PostgreSQLMigratorOptions,
): MigratorOptions => ({
  ...DefaultPostgreSQLMigratorOptions,
  schema: {
    ...DefaultPostgreSQLMigratorOptions.schema,
    ...(options?.schema ?? {}),
  },
  lock: {
    ...DefaultPostgreSQLMigratorOptions.lock,
    options: {
      ...DefaultPostgreSQLMigratorOptions.lock.options,
      ...(options ?? {}),
      lockId: MIGRATIONS_LOCK_ID,
    },
  },
  dryRun: DefaultPostgreSQLMigratorOptions.dryRun ?? options?.dryRun,
});
