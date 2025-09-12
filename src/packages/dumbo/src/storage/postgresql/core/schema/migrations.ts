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

registerDefaultMigratorOptions('PostgreSQL', DefaultPostgreSQLMigratorOptions);
