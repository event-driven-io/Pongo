import {
  MIGRATIONS_LOCK_ID,
  NoDatabaseLock,
  registerDefaultMigratorOptions,
  schemaComponent,
  SQL,
  sqlMigration,
  type DatabaseLockOptions,
  type MigratorOptions,
  type SchemaComponent,
} from '../../../../core';

const migrationTableSQL = SQL`
  CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    application TEXT NOT NULL DEFAULT 'default',
    sql_hash TEXT NOT NULL,
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
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

export const DefaultSQLiteMigratorOptions: MigratorOptions = {
  schema: {
    migrationTable: migrationTableSchemaComponent,
  },
  lock: {
    databaseLock: NoDatabaseLock,
    options: {
      lockId: MIGRATIONS_LOCK_ID,
    },
  },
};

export type SQLiteMigratorOptions = {
  schema?: Omit<SchemaComponent, 'migrationTable'>;
  lock?: {
    options?: Omit<DatabaseLockOptions, 'lockId'> &
      Partial<Pick<DatabaseLockOptions, 'lockId'>>;
  };
  dryRun?: boolean | undefined;
};

export const SQLiteMigratorOptions = (
  options?: SQLiteMigratorOptions,
): MigratorOptions => {
  const defaultOptions = DefaultSQLiteMigratorOptions;
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

registerDefaultMigratorOptions('SQLite', DefaultSQLiteMigratorOptions);
