import type { SQLDefaultSchemaNameToken } from '../sql';
import type { MigrationNamePrefixes } from './components/migrationNames';
import { haveSameSQL, type SQLMigration } from './sqlMigration';

export const schemaComponentType: unique symbol = Symbol(
  'dumbo.schemaComponent.type',
);

export type SchemaComponentKind = symbol;

export type SchemaComponentContext = Readonly<{
  databaseSchemaName?: string | SQLDefaultSchemaNameToken | undefined;
  tableName?: string | undefined;
  migrationNamePrefixes?: MigrationNamePrefixes | undefined;
}>;

export type SchemaComponent<
  Kind extends SchemaComponentKind = SchemaComponentKind,
> = Readonly<{
  [schemaComponentType]: Kind;
  components: ReadonlyArray<AnySchemaComponent>;
  migrations: (context?: SchemaComponentContext) => ReadonlyArray<SQLMigration>;
}>;

export type AnySchemaComponent = SchemaComponent<SchemaComponentKind>;

export type SchemaComponentMap<
  Component extends AnySchemaComponent = AnySchemaComponent,
> = Readonly<Record<string, Component>>;

export type SchemaComponentOptions = Readonly<{
  migrations?:
    | ((context: SchemaComponentContext) => ReadonlyArray<SQLMigration>)
    | undefined;
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
      throw new Error(
        `Duplicate migration name "${migration.name}" in schema component tree`,
      );
    }
  }

  return result;
};

export const schemaComponent = <const Kind extends SchemaComponentKind>(
  kind: Kind,
  options: SchemaComponentOptions = {},
): SchemaComponent<Kind> => {
  const children = Object.freeze([...(options.components ?? [])]);

  const component: SchemaComponent<Kind> = {
    [schemaComponentType]: kind,
    components: children,
    migrations: (context: SchemaComponentContext = {}) =>
      dedupeMigrations([
        ...(options.migrations?.(context) ?? []),
        ...children.flatMap((child) => child.migrations(context)),
      ]),
  };

  return component;
};

export const isSchemaComponent = (
  value: unknown,
): value is AnySchemaComponent =>
  typeof value === 'object' &&
  value !== null &&
  schemaComponentType in value &&
  'components' in value &&
  'migrations' in value;
