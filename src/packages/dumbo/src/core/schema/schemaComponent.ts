import { type SQLMigration } from './migrations';

export type SchemaComponent = {
  schemaComponentType: string;
  components: ReadonlyArray<SchemaComponent>;
  migrations: ReadonlyArray<SQLMigration>;
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
  const migrations = [
    ...(migrationsOrComponents.migrations ?? []),
    ...components.flatMap((component) => component.migrations),
  ];

  return {
    schemaComponentType: type,
    components,
    migrations,
  };
};
