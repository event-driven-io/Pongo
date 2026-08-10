import type { SQLDefaultSchemaNameToken } from '../sql';
import { haveSameSQL, type SQLMigration } from './sqlMigration';

export const schemaComponentType: unique symbol = Symbol(
  'dumbo.schemaComponent.type',
);
export const genericComponentType: unique symbol = Symbol(
  'dumbo.schemaComponent.generic',
);

export type SchemaComponentKind = symbol;

export type SchemaComponentContext = Readonly<{
  databaseSchemaName?: string | SQLDefaultSchemaNameToken | undefined;
  tableName?: string | undefined;
}>;

export type SchemaComponent<
  Kind extends SchemaComponentKind = SchemaComponentKind,
> = Readonly<{
  [schemaComponentType]: Kind;
  components: ReadonlyArray<AnySchemaComponent>;
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

export type SchemaComponentOptions = Readonly<{
  migrations?: SchemaComponentDeclaration | undefined;
  context?: SchemaComponentContext | undefined;
  components?: ReadonlyArray<AnySchemaComponent> | undefined;
}>;

export const schemaComponentMap = <
  const ComponentMap extends SchemaComponentMap,
>(
  record: ComponentMap,
): ComponentMap => {
  const result = Object.assign(Object.create(null), record) as ComponentMap;
  return Object.freeze(result);
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
  const Fields extends Readonly<Record<string, unknown>> = Readonly<
    Record<string, never>
  >,
>(
  kind: Kind,
  options: SchemaComponentOptions = {},
  fields: Fields = {} as Fields,
): SchemaComponent<Kind> & Fields => {
  const component = {
    ...fields,
    [schemaComponentType]: kind,
    components: Object.freeze([...(options.components ?? [])]),
    migrations(
      this: AnySchemaComponent,
      context: SchemaComponentContext = {},
    ): ReadonlyArray<SQLMigration> {
      const scoped = scopedContext(context, options.context);
      const result: SQLMigration[] = [];
      const migrationsByName = new Map<string, SQLMigration>();

      for (const migration of [
        ...(options.migrations?.(this, scoped) ?? []),
        ...this.components.flatMap((child) => child.migrations(scoped)),
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

  return Object.freeze(component);
};

export const schemaComponent = (
  options: SchemaComponentOptions = {},
): SchemaComponent<typeof genericComponentType> =>
  createSchemaComponent(genericComponentType, options);

export const isSchemaComponent = (
  value: unknown,
): value is AnySchemaComponent =>
  typeof value === 'object' &&
  value !== null &&
  schemaComponentType in value &&
  'components' in value &&
  'migrations' in value;
