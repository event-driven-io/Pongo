import type { ConnectorType } from '../..';
import { type SQLMigration } from '../migrations/migrations';

export type SchemaComponentMigrationsOptions = {
  connector: ConnectorType;
};

export type SchemaComponent = {
  schemaComponentType: string;
  components?: ReadonlyArray<SchemaComponent> | undefined;
  migrations(
    options: SchemaComponentMigrationsOptions,
  ): ReadonlyArray<SQLMigration>;
};

export const schemaComponent = (
  type: string,
  migrationsOrComponents:
    | {
        migrations(
          options: SchemaComponentMigrationsOptions,
        ): ReadonlyArray<SQLMigration>;
      }
    | {
        migrations(
          options: SchemaComponentMigrationsOptions,
        ): ReadonlyArray<SQLMigration>;
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
      : undefined;

  return {
    schemaComponentType: type,
    components,
    migrations: (options) => [
      ...(migrations ? migrations(options) : []),
      ...(components
        ? components.flatMap((component) => component.migrations(options))
        : []),
    ],
  };
};
