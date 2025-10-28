import { type DatabaseDriverType, type Dumbo } from '..';
import {
  runSQLMigrations,
  type MigratorOptions,
  type SQLMigration,
} from './migrations';

export type DatabaseURNType = 'sc:dumbo:database';
export type SchemaURNType = 'sc:dumbo:schema';
export type TableURNType = 'sc:dumbo:table';
export type ColumnURNType = 'sc:dumbo:column';
export type IndexURNType = 'sc:dumbo:index';

export type DatabaseURN = `${DatabaseURNType}:${string}`;
export type SchemaURN = `${SchemaURNType}:${string}`;
export type TableURN = `${TableURNType}:${string}`;
export type ColumnURN = `${ColumnURNType}:${string}`;
export type IndexURN = `${IndexURNType}:${string}`;

export const schemaComponentURN = {
  database: {
    type: 'sc:dumbo:database' as DatabaseURNType,
    build: (name: string): DatabaseURN => `sc:dumbo:database:${name}`,
  },
  schema: {
    type: 'sc:dumbo:schema' as SchemaURNType,
    build: (name: string): SchemaURN => `sc:dumbo:schema:${name}`,
  },
  table: {
    type: 'sc:dumbo:table' as TableURNType,
    build: (name: string): TableURN => `sc:dumbo:table:${name}`,
  },
  column: {
    type: 'sc:dumbo:column' as ColumnURNType,
    build: (name: string): ColumnURN => `sc:dumbo:column:${name}`,
  },
  index: {
    type: 'sc:dumbo:index' as IndexURNType,
    build: (name: string): IndexURN => `sc:dumbo:index:${name}`,
  },
  extractName: (urn: string): string => {
    const parts = urn.split(':');
    return parts[parts.length - 1] || '';
  },
} as const;

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

export type DatabaseSchemaComponent = SchemaComponent<
  DatabaseURN,
  Readonly<{
    databaseName: string;
    schemas: ReadonlyMap<string, DatabaseSchemaSchemaComponent>;
  }>
>;

export type DatabaseSchemaSchemaComponent = SchemaComponent<
  SchemaURN,
  Readonly<{
    schemaName: string;
    tables: ReadonlyMap<string, TableSchemaComponent>;
  }>
>;

export type TableSchemaComponent = SchemaComponent<
  TableURN,
  Readonly<{
    tableName: string;
    columns: ReadonlyMap<string, ColumnSchemaComponent>;
    indexes: ReadonlyMap<string, IndexSchemaComponent>;
  }>
>;

export type ColumnSchemaComponent = SchemaComponent<
  ColumnURN,
  Readonly<{
    columnName: string;
  }>
>;

export type IndexSchemaComponent = SchemaComponent<
  IndexURN,
  Readonly<{
    indexName: string;
    columns: ReadonlyMap<string, ColumnSchemaComponent>;
    isUnique: boolean;
  }>
>;

export const databaseSchemaComponent = ({
  databaseName,
  schemaNames,
  ...migrationsOrComponents
}: {
  databaseName: string;
  schemaNames?: string[];
} & SchemaComponentOptions): DatabaseSchemaComponent => {
  const schemas =
    schemaNames?.map((schemaName) =>
      databaseSchemaSchemaComponent({ schemaName }),
    ) ?? [];

  const sc = schemaComponent(schemaComponentURN.database.build(databaseName), {
    migrations: migrationsOrComponents.migrations ?? [],
    components: [...(migrationsOrComponents.components ?? []), ...schemas],
  });

  return {
    ...sc,
    databaseName,
    get schemas() {
      return mapSchemaComponentsOfType<DatabaseSchemaSchemaComponent>(
        sc.components,
        schemaComponentURN.schema.type,
        (c) => c.schemaName,
      );
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
  const tables =
    tableNames?.map((tableName) => tableSchemaComponent({ tableName })) ?? [];

  const sc = schemaComponent(schemaComponentURN.schema.build(schemaName), {
    migrations: migrationsOrComponents.migrations ?? [],
    components: [...(migrationsOrComponents.components ?? []), ...tables],
  });

  return {
    ...sc,
    schemaName,
    get tables() {
      return mapSchemaComponentsOfType<TableSchemaComponent>(
        sc.components,
        schemaComponentURN.table.type,
        (c) => c.tableName,
      );
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
  const columns =
    columnNames?.map((columnName) => columnSchemaComponent({ columnName })) ??
    [];

  const sc = schemaComponent(schemaComponentURN.table.build(tableName), {
    migrations: migrationsOrComponents.migrations ?? [],
    components: [...(migrationsOrComponents.components ?? []), ...columns],
  });

  return {
    ...sc,
    tableName,
    get columns() {
      return mapSchemaComponentsOfType<ColumnSchemaComponent>(
        sc.components,
        schemaComponentURN.column.type,
        (c) => c.columnName,
      );
    },
    get indexes() {
      return mapSchemaComponentsOfType<IndexSchemaComponent>(
        sc.components,
        schemaComponentURN.index.type,
        (c) => c.indexName,
      );
    },
  };
};

export const columnSchemaComponent = ({
  columnName,
  ...migrationsOrComponents
}: {
  columnName: string;
} & SchemaComponentOptions): ColumnSchemaComponent => {
  const sc = schemaComponent(
    schemaComponentURN.column.build(columnName),
    migrationsOrComponents,
  );

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
  const columns = columnNames.map((columnName) =>
    columnSchemaComponent({ columnName }),
  );

  const sc = schemaComponent(schemaComponentURN.index.build(indexName), {
    migrations: migrationsOrComponents.migrations ?? [],
    components: [...(migrationsOrComponents.components ?? []), ...columns],
  });

  return {
    ...sc,
    indexName,
    get columns() {
      return mapSchemaComponentsOfType<ColumnSchemaComponent>(
        sc.components,
        schemaComponentURN.column.type,
        (c) => c.columnName,
      );
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
