import { type DatabaseDriverType, type Dumbo } from '..';
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

export type SchemaComponentOptions<
  AdditionalOptions extends Record<string, unknown> = Record<string, unknown>,
> = {
  migrations?: ReadonlyArray<SQLMigration>;
  components?: ReadonlyArray<SchemaComponent>;
} & Omit<AdditionalOptions, 'migrations' | 'components'>;

export type SchemaComponentType<Kind extends string = string> = `sc:${Kind}`;
export type DumboSchemaComponentType<Kind extends string = string> =
  SchemaComponentType<`dumbo:${Kind}`>;

export const schemaComponent = <ComponentType extends string = string>(
  type: ComponentType,
  migrationsOrComponents: SchemaComponentOptions,
): SchemaComponent<ComponentType> => {
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
  };
};

export const isSchemaComponentOfType = <
  SchemaComponentOfType extends AnySchemaComponent = AnySchemaComponent,
>(
  component: AnySchemaComponent,
  type: AnySchemaComponent['schemaComponentType'],
): component is SchemaComponentOfType =>
  component.schemaComponentType.startsWith(type);

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

export type DatabaseSchemaComponent = SchemaComponent<
  `sc:dumbo:database`,
  {
    databaseName: string;
    schemas: ReadonlyMap<string, DatabaseSchemaSchemaComponent>;
    //addSchema: (schema: DatabaseSchemaSchemaComponent) => void;
  }
>;

export type DatabaseSchemaSchemaComponent = SchemaComponent<
  `sc:dumbo:database_schema`,
  {
    schemaName: string;
    tables: ReadonlyMap<string, TableSchemaComponent>;
  }
>;

export type TableSchemaComponent = SchemaComponent<
  `sc:dumbo:table`,
  {
    tableName: string;
    columns: ReadonlyMap<string, ColumnSchemaComponent>;
    indexes: ReadonlyMap<string, IndexSchemaComponent>;
  }
>;

export type ColumnSchemaComponent = SchemaComponent<`sc:dumbo:column`> & {
  columnName: string;
};

export type IndexSchemaComponent = SchemaComponent<`sc:dumbo:index`> & {
  indexName: string;
  columns: ReadonlyMap<string, ColumnSchemaComponent>;
  isUnique: boolean;
};

export const databaseSchemaComponent = ({
  databaseName,
  schemaNames,
  ...migrationsOrComponents
}: {
  databaseName: string;
  schemaNames?: string[];
} & SchemaComponentOptions): DatabaseSchemaComponent => {
  const migrations = migrationsOrComponents.migrations ?? [];
  const components = migrationsOrComponents.components ?? [];
  schemaNames = schemaNames ?? [];

  const sc = schemaComponent(`sc:dumbo:database`, {
    migrations,
    components: [
      ...components,
      ...schemaNames.map((schemaName) =>
        databaseSchemaSchemaComponent({ schemaName }),
      ),
    ],
  });

  return {
    ...sc,
    databaseName,
    get schemas() {
      return filterSchemaComponentsOfType<DatabaseSchemaSchemaComponent>(
        sc.components,
        (c) =>
          isSchemaComponentOfType<DatabaseSchemaSchemaComponent>(
            c,
            `sc:dumbo:database`,
          ),
      ).reduce((map, schema) => {
        map.set(schema.schemaName, schema);
        return map;
      }, new Map<string, DatabaseSchemaSchemaComponent>());
    },
  };
};

export const databaseSchemaSchemaComponent = ({
  schemaName,
  tableNames,
  ...migrationsOrComponents
}: {
  schemaName: string;
  tableNames?: string[];
} & SchemaComponentOptions): DatabaseSchemaSchemaComponent => {
  const migrations = migrationsOrComponents.migrations ?? [];
  const components = migrationsOrComponents.components ?? [];
  tableNames = tableNames ?? [];

  const sc = schemaComponent(`sc:dumbo:database_schema`, {
    migrations,
    components: [
      ...components,
      ...tableNames.map((tableName) => tableSchemaComponent({ tableName })),
    ],
  });

  return {
    ...sc,
    schemaName,
    get tables() {
      return filterSchemaComponentsOfType<TableSchemaComponent>(
        sc.components,
        (c) =>
          isSchemaComponentOfType<TableSchemaComponent>(c, `sc:dumbo:table`),
      ).reduce((map, table) => {
        map.set(table.tableName, table);
        return map;
      }, new Map<string, TableSchemaComponent>());
    },
  };
};

export const tableSchemaComponent = ({
  tableName,
  columnNames,
  ...migrationsOrComponents
}: {
  tableName: string;
  columnNames?: string[];
} & SchemaComponentOptions): TableSchemaComponent => {
  const migrations = migrationsOrComponents.migrations ?? [];
  const components = migrationsOrComponents.components ?? [];
  columnNames = columnNames ?? [];

  const sc = schemaComponent(`sc:dumbo:table`, {
    migrations,
    components: [
      ...components,
      ...columnNames.map((columnName) => columnSchemaComponent({ columnName })),
    ],
  });

  return {
    ...sc,
    tableName,
    get columns() {
      return filterSchemaComponentsOfType<ColumnSchemaComponent>(
        sc.components,
        (c) =>
          isSchemaComponentOfType<ColumnSchemaComponent>(c, `sc:dumbo:column`),
      ).reduce((map, column) => {
        map.set(column.columnName, column);
        return map;
      }, new Map<string, ColumnSchemaComponent>());
    },
    get indexes() {
      return filterSchemaComponentsOfType<IndexSchemaComponent>(
        sc.components,
        (c) =>
          isSchemaComponentOfType<IndexSchemaComponent>(c, `sc:dumbo:index`),
      ).reduce((map, index) => {
        map.set(index.indexName, index);
        return map;
      }, new Map<string, IndexSchemaComponent>());
    },
  };
};

export const columnSchemaComponent = ({
  columnName,
  ...migrationsOrComponents
}: {
  columnName: string;
} & SchemaComponentOptions): ColumnSchemaComponent => {
  const sc = schemaComponent(`sc:dumbo:column`, migrationsOrComponents);

  return {
    ...sc,
    columnName,
  };
};

export const indexSchemaComponent = ({
  indexName,
  columnNames,
  isUnique,
  ...migrationsOrComponents
}: {
  indexName: string;
  columnNames: string[];
  isUnique: boolean;
} & SchemaComponentOptions): IndexSchemaComponent => {
  const migrations = migrationsOrComponents.migrations ?? [];
  const components = migrationsOrComponents.components ?? [];

  const sc = schemaComponent(`sc:dumbo:index`, {
    migrations,
    components: [
      ...components,
      ...columnNames.map((columnName) => columnSchemaComponent({ columnName })),
    ],
  });

  return {
    ...sc,
    indexName,
    get columns() {
      return filterSchemaComponentsOfType<ColumnSchemaComponent>(
        sc.components,
        (c) =>
          isSchemaComponentOfType<ColumnSchemaComponent>(c, `sc:dumbo:column`),
      ).reduce((map, column) => {
        map.set(column.columnName, column);
        return map;
      }, new Map<string, ColumnSchemaComponent>());
    },
    isUnique,
  };
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
