import { haveSameSQL, type SQLMigration } from './sqlMigration';

export const schemaComponentType: unique symbol = Symbol(
  'dumbo.schemaComponent.type',
);
export const genericComponentType: unique symbol = Symbol(
  'dumbo.schemaComponent.generic',
);

export type SchemaComponentKind = symbol;

export type SchemaComponentContext = Readonly<{
  databaseName?: string | undefined;
  databaseSchemaName?: string | undefined;
  tableName?: string | undefined;
}>;

export type SchemaComponent<
  Kind extends SchemaComponentKind = SchemaComponentKind,
> = Readonly<{
  [schemaComponentType]: Kind;
  components: SchemaComponentMap;
  migrations: (context?: SchemaComponentContext) => ReadonlyArray<SQLMigration>;
}>;

export type SchemaComponentDeclaration = (
  component: AnySchemaComponent,
  context: SchemaComponentContext,
) => ReadonlyArray<SQLMigration>;

export type AnySchemaComponent = SchemaComponent<SchemaComponentKind>;

export type SchemaComponentMap<
  Component extends AnySchemaComponent = AnySchemaComponent,
> = Readonly<Record<string, Component>>;

export type SchemaComponentOptions<
  Components extends SchemaComponentMap = SchemaComponentMap,
> = Readonly<{
  migrations?: SchemaComponentDeclaration | undefined;
  context?: SchemaComponentContext | undefined;
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

const scopedContext = (
  context: SchemaComponentContext,
  scope: SchemaComponentContext | undefined,
): SchemaComponentContext => {
  if (scope === undefined) return context;

  const merged = { ...context };
  for (const [key, value] of Object.entries(scope)) {
    if (value !== undefined) (merged as Record<string, unknown>)[key] = value;
  }
  return merged;
};

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
    components: schemaComponentMap(
      (options.components ?? {}) as SchemaComponentMap,
    ),
    migrations(
      this: AnySchemaComponent,
      context: SchemaComponentContext = {},
    ): ReadonlyArray<SQLMigration> {
      const scoped = scopedContext(context, options.context);
      const result: SQLMigration[] = [];
      const migrationsByName = new Map<string, SQLMigration>();

      for (const migration of [
        ...(options.migrations?.(this, scoped) ?? []),
        ...Object.values(this.components).flatMap((child) =>
          child.migrations(scoped),
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

export const isSchemaComponent = (
  value: unknown,
): value is AnySchemaComponent =>
  typeof value === 'object' &&
  value !== null &&
  schemaComponentType in value &&
  'components' in value &&
  'migrations' in value;
