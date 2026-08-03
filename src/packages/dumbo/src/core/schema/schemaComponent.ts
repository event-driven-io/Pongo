import { haveSameSQL, type SQLMigration } from './sqlMigration';

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
  parent?: AnySchemaComponent | undefined;
  components: SchemaComponentMap;
  migrations: () => ReadonlyArray<SQLMigration>;
}>;

export type SchemaComponentDeclaration = (
  component: AnySchemaComponent,
) => ReadonlyArray<SQLMigration>;

export type AnySchemaComponent = SchemaComponent<SchemaComponentKind>;

export type SchemaComponentMap<
  Component extends AnySchemaComponent = AnySchemaComponent,
> = Readonly<Record<string, Component>>;

export type SchemaComponentOptions<
  Components extends SchemaComponentMap = SchemaComponentMap,
> = Readonly<{
  migrations?: SchemaComponentDeclaration | undefined;
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

export const withParent = (
  component: AnySchemaComponent,
  parent: AnySchemaComponent,
): AnySchemaComponent => {
  const clone = { ...component, parent };
  clone.components = componentsWithParent(component.components, clone);
  return Object.freeze(clone);
};

const componentsWithParent = (
  components: SchemaComponentMap,
  parent: AnySchemaComponent,
): SchemaComponentMap =>
  schemaComponentMap(
    Object.fromEntries(
      Object.entries(components).map(([alias, child]) => [
        alias,
        withParent(child, parent),
      ]),
    ),
  );

export const createSchemaComponent = <
  const Kind extends SchemaComponentKind,
  const Components extends SchemaComponentMap = SchemaComponentMap,
  const Fields extends Readonly<Record<string, unknown>> = Readonly<
    Record<string, never>
  >,
>(
  kind: Kind,
  options: SchemaComponentOptions<Components> = {},
  fields: Fields = {} as Fields,
): SchemaComponent<Kind> & Fields & { components: Components } => {
  const component = {
    ...fields,
    [schemaComponentType]: kind,
    components: schemaComponentMap<SchemaComponentMap>({}),
    migrations(this: AnySchemaComponent): ReadonlyArray<SQLMigration> {
      const result: SQLMigration[] = [];
      const migrationsByName = new Map<string, SQLMigration>();

      for (const migration of [
        ...(options.migrations?.(this) ?? []),
        ...Object.values(this.components).flatMap((child) =>
          child.migrations(),
        ),
      ]) {
        const previous = migrationsByName.get(migration.name);
        if (previous === undefined) {
          migrationsByName.set(migration.name, migration);
          result.push(migration);
        } else if (!haveSameSQL(previous, migration)) {
          throw new Error(
            `Duplicate migration name "${migration.name}" in schema component tree`,
          );
        }
      }

      return result;
    },
  };
  component.components = componentsWithParent(
    options.components ?? {},
    component,
  );

  return Object.freeze(component) as SchemaComponent<Kind> &
    Fields & {
      components: Components;
    };
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
