import type { DatabaseDriverType, Dumbo } from '..';
import {
  runSQLMigrations,
  type MigratorOptions,
  type SQLMigration,
} from './migrations';

export type SchemaComponent<
  ComponentType extends string = string,
  AdditionalData extends Record<string, unknown> | undefined = undefined,
> = {
  schemaComponentType: ComponentType;
  components: ReadonlyArray<SchemaComponent>;
  migrations: ReadonlyArray<SQLMigration>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addComponent: (component: SchemaComponent<string, any>) => void;
  addMigration: (migration: SQLMigration) => void;
} & Omit<
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  AdditionalData extends undefined ? {} : AdditionalData,
  | 'schemaComponentType'
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

export type MigrationsAndComponents = {
  migrations: ReadonlyArray<SQLMigration>;
  components: ReadonlyArray<SchemaComponent>;
};

export type SchemaComponentOptions<
  AdditionalOptions extends Record<string, unknown> = Record<string, unknown>,
> = (
  | {
      migrations: ReadonlyArray<SQLMigration>;
      components?: never;
    }
  | MigrationsAndComponents
  | {
      migrations?: never;
      components: ReadonlyArray<SchemaComponent>;
    }
) &
  Omit<AdditionalOptions, 'migrations' | 'components'>;

export const schemaComponentFactory = <
  SchemaComponentToCreate extends AnySchemaComponent = AnySchemaComponent,
>(
  ...args: ExtractAdditionalData<SchemaComponentToCreate> extends undefined
    ? [
        type: SchemaComponentToCreate['schemaComponentType'],
        migrationsOrComponents: SchemaComponentOptions,
      ]
    : [
        type: SchemaComponentToCreate['schemaComponentType'],
        migrationsOrComponents: SchemaComponentOptions,
        setup: (options: {
          migrations: Array<SQLMigration>;
          components: Array<SchemaComponent>;
        }) => ExtractAdditionalData<SchemaComponentToCreate>,
      ]
): SchemaComponentToCreate => {
  const [type, migrationsOrComponents, setup] = args;

  const components: AnySchemaComponent[] = [
    ...(migrationsOrComponents.components ?? []),
  ];
  const migrations: SQLMigration[] = [
    ...(migrationsOrComponents.migrations ?? []),
  ];

  return {
    schemaComponentType: type,
    components,
    get migrations(): SQLMigration[] {
      return [...migrations, ...components.flatMap((c) => c.migrations)];
    },
    addComponent: (component: SchemaComponent) => {
      components.push(component);
      migrations.push(...component.migrations);
    },
    addMigration: (migration: SQLMigration) => {
      migrations.push(migration);
    },
    ...(setup
      ? setup({ migrations, components })
      : ({} as ExtractAdditionalData<SchemaComponentToCreate>)),
  } satisfies SchemaComponent as unknown as SchemaComponentToCreate;
};

export type SchemaComponentType<Kind extends string = string> = `sc:${Kind}`;
export type DumboSchemaComponentType<Kind extends string = string> =
  SchemaComponentType<`dumbo:${Kind}`>;

export const schemaComponent = <ComponentType extends string = string>(
  type: ComponentType,
  migrationsOrComponents: SchemaComponentOptions,
): SchemaComponent<ComponentType> =>
  schemaComponentFactory(type, migrationsOrComponents);

export const isSchemaComponentOfKind = <
  SchemaComponentOfKind extends AnySchemaComponent = AnySchemaComponent,
>(
  component: AnySchemaComponent,
  kind: AnySchemaComponent['schemaComponentType'],
): component is SchemaComponentOfKind =>
  component.schemaComponentType.startsWith(kind);

export const filterSchemaComponentsOfType = <T extends AnySchemaComponent>(
  components: ReadonlyArray<AnySchemaComponent>,
  typeGuard: (component: AnySchemaComponent) => component is T,
): T[] => components.filter(typeGuard);

export const findSchemaComponentsOfType = <T extends AnySchemaComponent>(
  root: AnySchemaComponent,
  typeGuard: (component: AnySchemaComponent) => component is T,
): T[] => {
  const results: T[] = [];

  const traverse = (component: AnySchemaComponent) => {
    if (typeGuard(component)) {
      results.push(component);
    }
    for (const child of component.components) {
      traverse(child);
    }
  };

  traverse(root);

  return results;
};

export type DatabaseSchemaComponent<Kind extends string = 'regular'> =
  SchemaComponent<
    `sc:dumbo:database_schema:${Kind}`,
    {
      databaseName: string;
      schemas: ReadonlyArray<DatabaseSchemaSchemaComponent>;
    }
  >;

export const databaseSchemaComponent = <Kind extends string = 'regular'>({
  kind,
  databaseName,
  schemas,
  ...migrationsOrComponents
}: {
  kind?: Kind;
  databaseName: string;
  schemas: ReadonlyArray<DatabaseSchemaSchemaComponent>;
} & SchemaComponentOptions): DatabaseSchemaComponent<Kind> => {
  kind ??= 'regular' as Kind;

  const { migrations, components } = migrationsOrComponents;

  return schemaComponentFactory(
    `sc:dumbo:database_schema:${kind}`,
    {
      migrations: migrations ?? [],
      components: [...(components ?? []), ...schemas],
    },
    ({
      components,
    }: {
      migrations: ReadonlyArray<SQLMigration>;
      components: ReadonlyArray<SchemaComponent>;
    }) => ({
      databaseName,
      get schemas() {
        return filterSchemaComponentsOfType<
          DatabaseSchemaSchemaComponent<Kind>
        >(components, (c) =>
          isSchemaComponentOfKind<DatabaseSchemaSchemaComponent<Kind>>(
            c,
            `sc:dumbo:database_schema:${kind}`,
          ),
        );
      },
    }),
  );
};

export type DatabaseSchemaSchemaComponent<Kind extends string = 'regular'> =
  SchemaComponent<
    `sc:dumbo:database_schema:${Kind}`,
    {
      schemaName: string;
      tables: ReadonlyMap<string, TableSchemaComponent>;
    }
  >;

export type TableSchemaComponent<Kind extends string = 'regular'> =
  SchemaComponent<
    `sc:dumbo:table:${Kind}`,
    {
      tableName: string;
      columns: ReadonlyMap<string, ColumnSchemaComponent>;
      indexes: ReadonlyMap<string, IndexSchemaComponent>;
    }
  >;

export type ColumnSchemaComponent<Kind extends string = 'regular'> =
  SchemaComponent<`sc:dumbo:column:${Kind}`> & {
    columnName: string;
  };

export type IndexSchemaComponent<Kind extends string = 'regular'> =
  SchemaComponent<`sc:dumbo:index:${Kind}`> & {
    indexName: string;
    columns: ReadonlyMap<string, ColumnSchemaComponent>;
    unique: boolean;
  };

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
      //TODO: name is not the safest choice here, so we might want to add an id or hash instead
      const pendingMigrations = component.migrations.filter(
        (m) => !completedMigrations.includes(m.name),
      );

      if (pendingMigrations.length === 0) return;

      await runSQLMigrations(dumbo, pendingMigrations, options);

      completedMigrations.push(...pendingMigrations.map((m) => m.name));
    },
  };
};
