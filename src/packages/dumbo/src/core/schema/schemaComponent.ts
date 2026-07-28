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
  components: SchemaComponentRecord;
  migrations: ReadonlyArray<SQLMigration>;
}>;

export type AnySchemaComponent = SchemaComponent<SchemaComponentKind>;

export type SchemaComponentRecord<
  Component extends AnySchemaComponent = AnySchemaComponent,
> = Readonly<Record<string, Component>>;

export type SchemaComponentOptions<
  Components extends SchemaComponentRecord = SchemaComponentRecord,
> = Readonly<{
  migrations?: ReadonlyArray<SQLMigration> | undefined;
  components?: Components | undefined;
}>;

export const createComponentRecord = <
  const RecordType extends SchemaComponentRecord,
>(
  record: RecordType,
): RecordType => {
  const result = Object.assign(Object.create(null), record) as RecordType;
  return Object.freeze(result);
};

export const mergeComponentRecords = (
  ...records: ReadonlyArray<SchemaComponentRecord>
): SchemaComponentRecord => {
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

  return createComponentRecord(merged);
};

const schemaComponentState: unique symbol = Symbol(
  'dumbo.schemaComponent.state',
);

type InternalSchemaComponent = AnySchemaComponent &
  Readonly<{
    [schemaComponentState]?: {
      localMigrations: ReadonlyArray<SQLMigration>;
      records: Record<string, SchemaComponentRecord>;
    };
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

    const local =
      (component as InternalSchemaComponent)[schemaComponentState]
        ?.localMigrations ?? component.migrations;

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

export const initializeSchemaComponent = <
  const Kind extends SchemaComponentKind,
  const Components extends SchemaComponentRecord = SchemaComponentRecord,
>(
  target: object,
  kind: Kind,
  options: SchemaComponentOptions<Components> = {},
): SchemaComponent<Kind> & { components: Components } => {
  const records: Record<string, SchemaComponentRecord> = Object.create(
    null,
  ) as Record<string, SchemaComponentRecord>;
  records.components = createComponentRecord(
    (options.components ?? {}) as Components,
  );
  const state = {
    localMigrations: Object.freeze([...(options.migrations ?? [])]),
    records,
  };
  const component = target as SchemaComponent<Kind> & {
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
      get: () => state.records.components,
      enumerable: true,
    },
    migrations: {
      get: () => migrationsFor(component),
      enumerable: true,
    },
  });

  return component;
};

export const createSchemaComponent = <
  const Kind extends SchemaComponentKind,
  const Components extends SchemaComponentRecord = SchemaComponentRecord,
>(
  kind: Kind,
  options: SchemaComponentOptions<Components> = {},
): SchemaComponent<Kind> & { components: Components } =>
  initializeSchemaComponent({}, kind, options);

export const schemaComponent = <
  const Components extends SchemaComponentRecord = SchemaComponentRecord,
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

export const copySchemaComponentSpecialization = (
  source: object,
  target: object,
  coreProperties: ReadonlySet<PropertyKey>,
): void => {
  for (const key of Reflect.ownKeys(source)) {
    if (coreProperties.has(key) || Reflect.has(target, key)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (descriptor !== undefined)
      Object.defineProperty(target, key, descriptor);
  }
};

export const localMigrationsOf = (
  component: AnySchemaComponent,
): ReadonlyArray<SQLMigration> =>
  (component as InternalSchemaComponent)[schemaComponentState]
    ?.localMigrations ?? component.migrations;

export const defineSchemaComponentRecord = (
  component: AnySchemaComponent,
  name: string,
  components: SchemaComponentRecord,
): void => {
  const state = (component as InternalSchemaComponent)[schemaComponentState];
  if (state === undefined) {
    throw new Error('Schema component does not support component records');
  }
  if (name in state.records || Reflect.has(component, name)) {
    throw new Error(`Schema component record "${name}" is already defined`);
  }
  state.records[name] = createComponentRecord(components);
  Object.defineProperty(component, name, {
    get: () => state.records[name],
    enumerable: true,
  });
};

export const replaceSchemaComponentRecord = (
  component: AnySchemaComponent,
  name: string,
  record: SchemaComponentRecord,
): void => {
  const state = (component as InternalSchemaComponent)[schemaComponentState];
  if (state === undefined || state.records[name] === undefined) {
    throw new Error(`Schema component has no "${name}" record`);
  }
  state.records[name] = createComponentRecord(record);
};
