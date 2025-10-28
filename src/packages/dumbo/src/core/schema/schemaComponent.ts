import { SQL, type DatabaseDriverType, type Dumbo } from '..';
import {
  runSQLMigrations,
  sqlMigration,
  type MigratorOptions,
  type SQLMigration,
} from './migrations';

export type SchemaComponent<
  ComponentKey extends string = string,
  AdditionalData extends Record<string, unknown> | undefined = undefined,
> = {
  schemaComponentKey: ComponentKey;
  components: ReadonlyMap<string, SchemaComponent>;
  migrations: ReadonlyArray<SQLMigration>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addComponent: (component: SchemaComponent<string, any>) => void;
  addMigration: (migration: SQLMigration) => void;
} & Omit<
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  AdditionalData extends undefined ? {} : AdditionalData,
  | 'schemaComponentKey'
  | 'components'
  | 'migrations'
  | 'addComponent'
  | 'addMigration'
>;

export type ExtractAdditionalData<T> =
  T extends SchemaComponent<infer _ComponentType, infer Data> ? Data : never;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnySchemaComponent = SchemaComponent<string, any>;
export type AnySchemaComponentOfType<ComponentType extends string = string> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SchemaComponent<ComponentType, any>;

export type SchemaComponentOptions<
  AdditionalOptions extends Record<string, unknown> = Record<string, unknown>,
> = {
  migrations?: ReadonlyArray<SQLMigration>;
  components?: ReadonlyArray<SchemaComponent>;
} & Omit<AdditionalOptions, 'migrations' | 'components'>;

export type SchemaComponentType<Kind extends string = string> = `sc:${Kind}`;

export type DumboSchemaComponentType<Kind extends string = string> =
  SchemaComponentType<`dumbo:${Kind}`>;

export const schemaComponent = <ComponentKey extends string = string>(
  key: ComponentKey,
  options: SchemaComponentOptions,
): SchemaComponent<ComponentKey> => {
  const componentsMap = new Map<string, AnySchemaComponent>(
    options.components?.map((comp) => [comp.schemaComponentKey, comp]),
  );

  const migrations: SQLMigration[] = [...(options.migrations ?? [])];

  return {
    schemaComponentKey: key,
    components: componentsMap,
    get migrations(): SQLMigration[] {
      return [
        ...migrations,
        ...Array.from(componentsMap.values()).flatMap((c) => c.migrations),
      ];
    },
    addComponent: (component: SchemaComponent) => {
      componentsMap.set(component.schemaComponentKey, component);
      migrations.push(...component.migrations);
    },
    addMigration: (migration: SQLMigration) => {
      migrations.push(migration);
    },
  };
};

export const isSchemaComponentOfType = <
  SchemaComponentOfType extends AnySchemaComponent = AnySchemaComponent,
>(
  component: AnySchemaComponent,
  prefix: string,
): component is SchemaComponentOfType =>
  component.schemaComponentKey.startsWith(prefix);

export const filterSchemaComponentsOfType = <T extends AnySchemaComponent>(
  components: ReadonlyMap<string, AnySchemaComponent>,
  prefix: string,
): ReadonlyMap<string, T> => mapSchemaComponentsOfType<T>(components, prefix);

export const mapSchemaComponentsOfType = <T extends AnySchemaComponent>(
  components: ReadonlyMap<string, AnySchemaComponent>,
  prefix: string,
  keyMapper?: (component: T) => string,
): ReadonlyMap<string, T> =>
  new Map(
    Array.from(components.entries())
      .filter(([urn]) => urn.startsWith(prefix))
      .map(([urn, component]) => [
        keyMapper ? keyMapper(component) : urn,
        component as T,
      ]),
  );

export const findSchemaComponentsOfType = <T extends AnySchemaComponent>(
  root: AnySchemaComponent,
  prefix: string,
): T[] => {
  const results: T[] = [];

  const traverse = (component: AnySchemaComponent) => {
    if (component.schemaComponentKey.startsWith(prefix)) {
      results.push(component as T);
    }
    for (const child of component.components.values()) {
      traverse(child);
    }
  };

  traverse(root);

  return results;
};

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
