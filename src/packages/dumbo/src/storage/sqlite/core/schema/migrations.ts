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

const { AutoIncrement, Varchar, Timestamp } = SQL.column.type;

const migrationTableSQL = SQL`
  CREATE TABLE IF NOT EXISTS migrations (
    id ${AutoIncrement({ primaryKey: true })},
    name ${Varchar(255)} NOT NULL UNIQUE,
    application ${Varchar(255)} NOT NULL DEFAULT 'default',
    sql_hash ${Varchar(64)} NOT NULL,
    timestamp ${Timestamp} NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`;

export const migrationTableSchemaComponent = schemaComponent(
  'dumbo:schema-component:migrations-table',
  {
    migrations: [sqlMigration('dumbo:migrationTable:001', [migrationTableSQL])],
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
