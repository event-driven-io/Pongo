import type { Dumbo } from '../..';
import { fromDatabaseDriverType, type DatabaseDriverType } from '../../drivers';
import { SQL } from '../../sql';
import { schemaComponent, type SchemaComponent } from '../schemaComponent';
import { sqlMigration } from '../sqlMigration';
import {
  getDefaultMigratorOptionsFromRegistry,
  type MigratorOptions,
  runSQLMigrations,
} from './migrator';

const { AutoIncrement, Varchar, Timestamp } = SQL.column.type;

export const migrationTableComponentFor = ({
  schemaName,
  tableName = 'dmb_migrations',
  createSchema = false,
}: {
  schemaName?: string | undefined;
  tableName?: string | undefined;
  createSchema?: boolean | undefined;
} = {}): SchemaComponent => {
  const tableReference = schemaName
    ? SQL`${SQL.identifier(schemaName)}.${SQL.identifier(tableName)}`
    : SQL`${SQL.identifier(tableName)}`;
  const createSchemaSQL =
    createSchema && schemaName
      ? [SQL`CREATE SCHEMA IF NOT EXISTS ${SQL.identifier(schemaName)}`]
      : [];
  const migrationTableSQL = SQL`
  CREATE TABLE IF NOT EXISTS ${tableReference} (
    id ${AutoIncrement({ primaryKey: true })},
    name ${Varchar(255)} NOT NULL UNIQUE,
    application ${Varchar(255)} NOT NULL DEFAULT 'default',
    sql_hash ${Varchar(64)} NOT NULL,
    timestamp ${Timestamp} NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`;

  return schemaComponent({
    migrations: () => [
      sqlMigration('dumbo:migrationTable:001', [
        ...createSchemaSQL,
        migrationTableSQL,
      ]),
    ],
  });
};

export const migrationTableComponent: SchemaComponent =
  migrationTableComponentFor();

export type SchemaComponentMigrator = {
  component: SchemaComponent;
  run: (options?: Partial<MigratorOptions>) => Promise<void>;
};

export const SchemaComponentMigrator = <DriverType extends DatabaseDriverType>(
  component: SchemaComponent,
  dumbo: Dumbo<DriverType>,
): SchemaComponentMigrator => {
  const completedMigrations: string[] = [];

  return {
    component,
    run: async (options) => {
      const validateComponent =
        options?.schema?.validateComponent ??
        getDefaultMigratorOptionsFromRegistry(
          fromDatabaseDriverType(dumbo.driverType).databaseType,
        ).schema?.validateComponent;

      validateComponent?.(component);

      const pendingMigrations = component.migrations.filter(
        (migration) => !completedMigrations.includes(migration.name),
      );

      if (pendingMigrations.length === 0) return;

      await runSQLMigrations(dumbo, pendingMigrations, options);

      completedMigrations.push(
        ...pendingMigrations.map((migration) => migration.name),
      );
    },
  };
};
