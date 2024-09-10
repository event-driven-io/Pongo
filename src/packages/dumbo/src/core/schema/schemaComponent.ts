import type { Dumbo } from '../..';
import {
  combineMigrations,
  runSQLMigrations,
  type MigratorOptions,
  type SqlMigration,
} from './migrations';

export type SchemaComponent = {
  schemaComponentType: string;
  components?: ReadonlyArray<SchemaComponent> | undefined;
  migrations: ReadonlyArray<SqlMigration>;
  sql(): string;
  print(): void;
  migrate(pool: Dumbo, options: MigratorOptions): Promise<void>;
};

export const schemaComponent = (
  type: string,
  migrationsOrComponents:
    | { migrations: ReadonlyArray<SqlMigration> }
    | {
        migrations: ReadonlyArray<SqlMigration>;
        components: ReadonlyArray<SchemaComponent>;
      }
    | {
        components: ReadonlyArray<SchemaComponent>;
      },
): SchemaComponent => {
  const components =
    'components' in migrationsOrComponents
      ? migrationsOrComponents.components
      : undefined;

  const migrations =
    'migrations' in migrationsOrComponents
      ? migrationsOrComponents.migrations
      : migrationsOrComponents.components.flatMap((c) => c.migrations);

  return {
    schemaComponentType: type,
    components,
    migrations,
    sql: () => combineMigrations(...migrations),
    print: () => console.log(JSON.stringify(migrations)),
    migrate: (pool: Dumbo, options: MigratorOptions) =>
      runSQLMigrations(pool, migrations, options),
  };
};
