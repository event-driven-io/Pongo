import type { SchemaComponent } from '../../schemaComponent';
import { schemaComponent, schemaComponentMap } from '../../schemaComponent';
import type { SQLMigration } from '../../sqlMigration';
import {
  type AnyDatabaseSchemaComponent,
  assertSchemaKeysAreNotEmpty,
} from '../databaseSchema';
import type { AnyTableComponent } from '../table';

export type ExtensionTables = Readonly<Record<string, AnyTableComponent>>;

export type ExtensionSchemas = Readonly<
  Record<string, AnyDatabaseSchemaComponent>
>;

export interface AnyExtensionComponent extends SchemaComponent<
  'extension',
  string | undefined
> {
  readonly extensionName: string;
  readonly tables: ExtensionTables;
  readonly schemas: ExtensionSchemas;
  readonly withDatabaseSchemaName: (
    databaseSchemaName: string,
  ) => AnyExtensionComponent;
}

export type ExtensionComponent<
  Name extends string = string,
  Tables extends ExtensionTables = ExtensionTables,
  Schemas extends ExtensionSchemas = ExtensionSchemas,
  Kind extends string | undefined = undefined,
> = SchemaComponent<'extension', Kind> &
  Readonly<{
    extensionName: Name;
    tables: Tables;
    schemas: Schemas;
    withDatabaseSchemaName: (
      databaseSchemaName: string,
    ) => ExtensionComponent<Name, Tables, Schemas, Kind>;
  }>;

type ExtensionMigrations = (() => ReadonlyArray<SQLMigration>) | undefined;

export type ExtensionComponentOptions<
  Tables extends ExtensionTables,
  Schemas extends ExtensionSchemas,
  Kind extends string | undefined = undefined,
> =
  | Readonly<{
      tables: Tables;
      schemas?: never;
      kind?: Kind | undefined;
      migrations?: ExtensionMigrations;
    }>
  | Readonly<{
      schemas: Schemas;
      tables?: never;
      kind?: Kind | undefined;
      migrations?: ExtensionMigrations;
    }>
  | Readonly<{
      tables?: never;
      schemas?: never;
      kind?: Kind | undefined;
      migrations?: ExtensionMigrations;
    }>;

export const extensionComponent = <
  const Name extends string,
  const Tables extends ExtensionTables = Readonly<Record<never, never>>,
  const Schemas extends ExtensionSchemas = Readonly<Record<never, never>>,
  const Kind extends string | undefined = undefined,
>(
  extensionName: Name,
  options: ExtensionComponentOptions<Tables, Schemas, Kind> = {},
): ExtensionComponent<Name, Tables, Schemas, Kind> => {
  const tables = (options.tables ?? {}) as Tables;
  const schemas = (options.schemas ?? {}) as Schemas;

  assertSchemaKeysAreNotEmpty(schemas);

  const children = Object.freeze([
    ...Object.values(tables),
    ...Object.values(schemas),
  ]);

  const component: ExtensionComponent<Name, Tables, Schemas, Kind> = {
    ...schemaComponent('extension', {
      kind: options.kind,
      components: children,
      migrations: options.migrations,
    }),
    extensionName,
    tables: schemaComponentMap(tables),
    schemas: schemaComponentMap(schemas),
    withDatabaseSchemaName: (databaseSchemaName: string) => {
      const placed = Object.fromEntries(
        Object.entries(tables).map(([key, table]) => [
          key,
          table.withDatabaseSchemaName(databaseSchemaName),
        ]),
      ) as Tables;

      return Object.entries(placed).every(
        ([key, table]) => table === tables[key],
      )
        ? component
        : extensionComponent<Name, Tables, Schemas, Kind>(extensionName, {
            tables: placed,
            kind: options.kind,
            migrations: options.migrations,
          });
    },
  };

  return component;
};
