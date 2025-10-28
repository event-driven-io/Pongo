import type { Dumbo } from '../..';
import type { DatabaseDriverType } from '../../drivers';
import { SQL } from '../../sql';
import { schemaComponent, type SchemaComponent } from '../schemaComponent';
import { sqlMigration } from '../sqlMigration';
import { type MigratorOptions, runSQLMigrations } from './migrator';

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
      const pendingMigrations = component.migrations.filter(
        (m) =>
          !completedMigrations.includes(
            `${component.schemaComponentKey}:${m.name}`,
          ),
      );

      if (pendingMigrations.length === 0) return;

      await runSQLMigrations(dumbo, pendingMigrations, options);

      completedMigrations.push(
        ...pendingMigrations.map(
          (m) => `${component.schemaComponentKey}:${m.name}`,
        ),
      );
    },
  };
};
