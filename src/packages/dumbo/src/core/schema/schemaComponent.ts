import type { SQLMigration } from './sqlMigration';

export const schemaComponentType: unique symbol = Symbol(
  'dumbo.schemaComponent.type',
);
export const genericComponentType: unique symbol = Symbol(
  'dumbo.schemaComponent.generic',
);

export type SchemaComponentKind = symbol;

export type SchemaComponent<
  Kind extends SchemaComponentKind = SchemaComponentKind,
> = Readonly<{
  [schemaComponentType]: Kind;
  components: SchemaComponentMap;
  migrations: ReadonlyArray<SQLMigration>;
}>;

export type AnySchemaComponent = SchemaComponent<SchemaComponentKind>;

export type SchemaComponentMap<
  Component extends AnySchemaComponent = AnySchemaComponent,
> = Readonly<Record<string, Component>>;

export type SchemaComponentOptions<
  Components extends SchemaComponentMap = SchemaComponentMap,
> = Readonly<{
  migrations?: ReadonlyArray<SQLMigration> | undefined;
  components?: Components | undefined;
}>;

export const schemaComponentMap = <
  const ComponentMap extends SchemaComponentMap,
>(
  record: ComponentMap,
): ComponentMap => {
  const result = Object.assign(Object.create(null), record) as ComponentMap;
  return Object.freeze(result);
};

export const mergeSchemaComponentMaps = (
  ...records: ReadonlyArray<SchemaComponentMap>
): SchemaComponentMap => {
  const merged: Record<string, AnySchemaComponent> = Object.create(
    null,
  ) as Record<string, AnySchemaComponent>;

  for (const record of records) {
    for (const [alias, component] of Object.entries(record)) {
      if (Object.hasOwn(merged, alias)) {
        throw new Error(`Duplicate component alias "${alias}"`);
      }
      merged[alias] = component;
    }
  }

  return schemaComponentMap(merged);
};

const schemaComponentState: unique symbol = Symbol(
  'dumbo.schemaComponent.state',
);

type InternalSchemaComponent = AnySchemaComponent &
  Readonly<{
    [schemaComponentState]?: Readonly<{
      localMigrations: ReadonlyArray<SQLMigration>;
    }>;
  }>;

const migrationsFor = (
  root: AnySchemaComponent,
): ReadonlyArray<SQLMigration> => {
  const result: SQLMigration[] = [];
  const visited = new Set<AnySchemaComponent>();
  const migrationsByName = new Map<string, SQLMigration>();

  const visit = (component: AnySchemaComponent): void => {
    if (visited.has(component)) return;
    visited.add(component);

    const state = (component as InternalSchemaComponent)[schemaComponentState];
    const local = state?.localMigrations ?? component.migrations;

    for (const migration of local) {
      const previous = migrationsByName.get(migration.name);
      if (previous !== undefined && previous !== migration) {
        throw new Error(
          `Duplicate migration name "${migration.name}" in schema component tree`,
        );
      }
      if (previous === undefined) {
        migrationsByName.set(migration.name, migration);
        result.push(migration);
      }
    }

    for (const child of Object.values(component.components)) visit(child);
  };

  visit(root);
  return result;
};

export const createSchemaComponent = <
  const Kind extends SchemaComponentKind,
  const Components extends SchemaComponentMap = SchemaComponentMap,
>(
  kind: Kind,
  options: SchemaComponentOptions<Components> = {},
): SchemaComponent<Kind> & { components: Components } => {
  const components = schemaComponentMap(
    (options.components ?? {}) as Components,
  );
  const state = {
    localMigrations: Object.freeze([...(options.migrations ?? [])]),
  };
  const component = {} as SchemaComponent<Kind> & {
    components: Components;
  };

  Object.defineProperties(component, {
    [schemaComponentType]: {
      value: kind,
      enumerable: true,
    },
    [schemaComponentState]: {
      value: state,
    },
    components: {
      value: components,
      enumerable: true,
    },
    migrations: {
      get: () => migrationsFor(component),
      enumerable: true,
    },
  });

  return component;
};

export const schemaComponent = <
  const Components extends SchemaComponentMap = SchemaComponentMap,
>(
  options: SchemaComponentOptions<Components> = {},
): SchemaComponent<typeof genericComponentType> & {
  components: Components;
} => createSchemaComponent(genericComponentType, options);

export type SchemaComponentPredicate<T extends AnySchemaComponent> = (
  component: AnySchemaComponent,
) => component is T;

export const findComponents = <T extends AnySchemaComponent>(
  root: AnySchemaComponent,
  predicate: SchemaComponentPredicate<T>,
): T[] => {
  const results: T[] = [];
  const visited = new Set<AnySchemaComponent>();

  const visit = (component: AnySchemaComponent): void => {
    if (visited.has(component)) return;
    visited.add(component);
    if (predicate(component)) results.push(component);
    for (const child of Object.values(component.components)) visit(child);
  };

  visit(root);
  return results;
};

export const findComponent = <T extends AnySchemaComponent>(
  root: AnySchemaComponent,
  predicate: SchemaComponentPredicate<T>,
): T | undefined => findComponents(root, predicate)[0];

export const isSchemaComponent = (
  value: unknown,
): value is AnySchemaComponent =>
  typeof value === 'object' &&
  value !== null &&
  schemaComponentType in value &&
  'components' in value &&
  'migrations' in value;

export const localMigrationsOf = (
  component: AnySchemaComponent,
): ReadonlyArray<SQLMigration> =>
  (component as InternalSchemaComponent)[schemaComponentState]
    ?.localMigrations ?? component.migrations;
