import {
  type DatabaseLockOptions,
  type MigratorOptions,
  type SchemaComponent,
  MIGRATIONS_LOCK_ID,
  SQL,
  registerDefaultMigratorOptions,
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

export const getMigrationTableSchemaComponent = () =>
  schemaComponent('dumbo:schema-component:migrations-table', {
    migrations: () => [
      sqlMigration('dumbo:migrationTable:001', [migrationTableSQL]),
    ],
  });

export const getDefaultPostgreSQLMigratorOptions = (): MigratorOptions => ({
  schema: {
    migrationTable: getMigrationTableSchemaComponent(),
  },
  lock: {
    databaseLock: AdvisoryLock,
    options: {
      lockId: MIGRATIONS_LOCK_ID,
    },
  },
});

// For backward compatibility - but only call when actually needed
export const DefaultPostgreSQLMigratorOptions =
  getDefaultPostgreSQLMigratorOptions;

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
): MigratorOptions => {
  const defaultOptions = getDefaultPostgreSQLMigratorOptions();
  return {
    ...defaultOptions,
    schema: {
      ...defaultOptions.schema,
      ...(options?.schema ?? {}),
    },
    lock: {
      ...defaultOptions.lock,
      options: {
        ...defaultOptions.lock.options,
        ...(options ?? {}),
        lockId: MIGRATIONS_LOCK_ID,
      },
    },
    dryRun: defaultOptions.dryRun ?? options?.dryRun,
  };
};

const defaultPostgreSQLMigratorOptions: MigratorOptions = {
  schema: {
    migrationTable: getMigrationTableSchemaComponent(),
  },
  lock: {
    databaseLock: AdvisoryLock,
    options: {
      lockId: MIGRATIONS_LOCK_ID,
    },
  },
};

registerDefaultMigratorOptions('PostgreSQL', defaultPostgreSQLMigratorOptions);
