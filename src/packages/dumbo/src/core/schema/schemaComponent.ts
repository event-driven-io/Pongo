import type { DatabaseType } from '../connectors';
import { type SQLMigration } from './migrations';

export type SchemaComponent = {
  schemaComponentType: string;
  components: ReadonlyArray<SchemaComponent>;
  resolveMigrations(options: {
    databaseType: DatabaseType;
  }): ReadonlyArray<SQLMigration> | Promise<ReadonlyArray<SQLMigration>>;
};

export const schemaComponent = (
  type: string,
  migrationsOrComponents:
    | {
        migrations: ReadonlyArray<SQLMigration>;
        components?: never;
      }
    | {
        migrations: ReadonlyArray<SQLMigration>;
        components: ReadonlyArray<SchemaComponent>;
      }
    | {
        migrations?: never;
        components: ReadonlyArray<SchemaComponent>;
      },
): SchemaComponent => {
  const components = migrationsOrComponents.components ?? [];

  return {
    schemaComponentType: type,
    components,
    resolveMigrations: async (options) => {
      const migrations: SQLMigration[] = [
        ...(migrationsOrComponents.migrations ?? []),
      ];
      for (const component of components) {
        const componentMigrations = await component.resolveMigrations(options);
        migrations.push(...componentMigrations);
      }

      return migrations;
    },
  };
};
