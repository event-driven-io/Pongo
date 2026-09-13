import { InvalidOperationError } from '../errors';
import { haveSameSQL, type SQLMigration } from './sqlMigration';

export type SchemaComponent<
  ComponentType extends string,
  Kind extends string | undefined = undefined,
> = Readonly<{
  componentType: ComponentType;
  kind: Kind;
  migrations: () => ReadonlyArray<SQLMigration>;
}>;

export type AnySchemaComponent = SchemaComponent<string, string | undefined>;

export type SchemaComponentMap<
  Component extends AnySchemaComponent = AnySchemaComponent,
> = Readonly<Record<string, Component>>;

export type MergeRecords<Current, Added> = Omit<Current, keyof Added> & Added;

export type SchemaComponentOptions<
  Kind extends string | undefined = undefined,
> = Readonly<{
  kind?: Kind | undefined;
  migrations?: (() => ReadonlyArray<SQLMigration>) | undefined;
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

export const mergeSchemaComponentMaps = <
  ComponentMap extends SchemaComponentMap,
>(
  ...records: ReadonlyArray<SchemaComponentMap>
): ComponentMap =>
  schemaComponentMap(Object.assign({}, ...records) as ComponentMap);

export const dedupeMigrations = (
  migrations: ReadonlyArray<SQLMigration>,
): ReadonlyArray<SQLMigration> => {
  const result: SQLMigration[] = [];
  const migrationsByName = new Map<string, SQLMigration>();

  for (const migration of migrations) {
    const previous = migrationsByName.get(migration.name);
    if (previous === undefined) {
      migrationsByName.set(migration.name, migration);
      result.push(migration);
    } else if (!haveSameSQL(previous, migration)) {
      throw new InvalidOperationError(
        `Duplicate migration name "${migration.name}" in schema component tree`,
      );
    }
  }

  return result;
};

export const schemaComponent = <
  const ComponentType extends string,
  const Kind extends string | undefined = undefined,
>(
  componentType: ComponentType,
  options: SchemaComponentOptions<Kind> = {},
): SchemaComponent<ComponentType, Kind> => {
  const children = Object.freeze([...(options.components ?? [])]);

  const component: SchemaComponent<ComponentType, Kind> = {
    componentType,
    kind: options.kind as Kind,
    migrations: () =>
      dedupeMigrations([
        ...(options.migrations?.() ?? []),
        ...children.flatMap((child) => child.migrations()),
      ]),
  };

  return component;
};

export const isSchemaComponent = (
  value: unknown,
): value is AnySchemaComponent =>
  typeof value === 'object' &&
  value !== null &&
  'componentType' in value &&
  typeof value.componentType === 'string' &&
  'kind' in value &&
  (typeof value.kind === 'string' || value.kind === undefined) &&
  'migrations' in value &&
  typeof value.migrations === 'function';
