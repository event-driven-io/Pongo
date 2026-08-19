import type { SQLDefaultSchemaNameToken } from '../sql';
import type { AnyDatabaseSchemaComponent } from './components/databaseSchemaComponent';
import type { AnyTableComponent } from './components/tableComponent';
import {
  schemaComponent,
  schemaComponentMap,
  type SchemaComponent,
} from './schemaComponent';
import type { SQLMigration } from './sqlMigration';

export const extensionComponentType: unique symbol = Symbol(
  'dumbo.schemaComponent.extension',
);

export type ExtensionTables = Readonly<Record<string, AnyTableComponent>>;

export type ExtensionSchemas = Readonly<
  Record<string, AnyDatabaseSchemaComponent>
>;

export interface AnyExtensionComponent extends SchemaComponent<
  typeof extensionComponentType
> {
  readonly extensionName: string;
  readonly tables: ExtensionTables;
  readonly schemas: ExtensionSchemas;
  readonly withDatabaseSchemaName: (
    databaseSchemaName: string | SQLDefaultSchemaNameToken,
  ) => AnyExtensionComponent;
}

export type ExtensionComponent<
  Name extends string = string,
  Tables extends ExtensionTables = ExtensionTables,
  Schemas extends ExtensionSchemas = ExtensionSchemas,
> = SchemaComponent<typeof extensionComponentType> &
  Readonly<{
    extensionName: Name;
    tables: Tables;
    schemas: Schemas;
    withDatabaseSchemaName: (
      databaseSchemaName: string | SQLDefaultSchemaNameToken,
    ) => ExtensionComponent<Name, Tables, Schemas>;
  }>;

type ExtensionMigrations = (() => ReadonlyArray<SQLMigration>) | undefined;

export type ExtensionComponentOptions<
  Tables extends ExtensionTables,
  Schemas extends ExtensionSchemas,
> =
  | Readonly<{
      tables: Tables;
      schemas?: never;
      migrations?: ExtensionMigrations;
    }>
  | Readonly<{
      schemas: Schemas;
      tables?: never;
      migrations?: ExtensionMigrations;
    }>
  | Readonly<{
      tables?: never;
      schemas?: never;
      migrations?: ExtensionMigrations;
    }>;

export const extensionComponent = <
  const Name extends string,
  const Tables extends ExtensionTables = Readonly<Record<never, never>>,
  const Schemas extends ExtensionSchemas = Readonly<Record<never, never>>,
>(
  extensionName: Name,
  options: ExtensionComponentOptions<Tables, Schemas> = {},
): ExtensionComponent<Name, Tables, Schemas> => {
  const tables = (options.tables ?? {}) as Tables;
  const schemas = (options.schemas ?? {}) as Schemas;

  for (const [schemaKey, schema] of Object.entries(schemas)) {
    if (schemaKey === '')
      throw new Error('Database schema record key cannot be an empty string');

    if (
      typeof schema.schemaName === 'string' &&
      schema.schemaName !== schemaKey
    ) {
      throw new Error(
        `Database schema record key "${schemaKey}" conflicts with its explicit name "${schema.schemaName}"`,
      );
    }
  }

  const children = Object.freeze([
    ...Object.values(tables),
    ...Object.values(schemas),
  ]);

  const component: ExtensionComponent<Name, Tables, Schemas> = {
    ...schemaComponent(extensionComponentType, {
      components: children,
      migrations: options.migrations,
    }),
    extensionName,
    tables: schemaComponentMap(tables),
    schemas: schemaComponentMap(schemas),
    withDatabaseSchemaName: (
      databaseSchemaName: string | SQLDefaultSchemaNameToken,
    ) => {
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
        : extensionComponent<Name, Tables, Schemas>(extensionName, {
            tables: placed,
            migrations: options.migrations,
          });
    },
  };

  return component;
};
