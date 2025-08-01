import {
  MIGRATIONS_LOCK_ID,
  NoDatabaseLock,
  runSQLMigrations,
  schemaComponent,
  SQL,
  sqlMigration,
  type DatabaseLockOptions,
  type Dumbo,
  type SQLMigration,
} from '../../../../core';

export type SQLiteMigratorOptions = {
  lock?: {
    options?: Omit<DatabaseLockOptions, 'lockId'> &
      Partial<Pick<DatabaseLockOptions, 'lockId'>>;
  };
  dryRun?: boolean | undefined;
};

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

export const runSQLiteMigrations = (
  pool: Dumbo,
  migrations: SQLMigration[],
  options?: SQLiteMigratorOptions,
): Promise<void> =>
  runSQLMigrations(pool, migrations, {
    schema: {
      migrationTable: migrationTableSchemaComponent,
    },
    lock: {
      databaseLock: NoDatabaseLock, // TODO: Use SQLite compliant locking
      options: {
        ...(options ?? {}),
        lockId: MIGRATIONS_LOCK_ID,
      },
    },
    dryRun: options?.dryRun,
  });
