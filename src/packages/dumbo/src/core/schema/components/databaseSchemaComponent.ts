import { SQL, SQLCreateSchema, SQLDefaultSchemaNameToken } from '../../sql';
import type { AnyExtensionComponent } from '../extensionComponent';
import {
  schemaComponent,
  schemaComponentMap,
  type SchemaComponent,
  type SchemaComponentContext,
} from '../schemaComponent';
import { sqlMigration, type SQLMigration } from '../sqlMigration';
import { migrationName } from './migrationName';
import type { AnyTableComponent } from './tableComponent';

export const databaseSchemaComponentType: unique symbol = Symbol(
  'dumbo.schemaComponent.databaseSchema',
);

const databaseSchemaMigrationName = (
  databaseSchemaName: string,
  kind: string | undefined,
): string => migrationName('schema', kind, [databaseSchemaName], 'create');

export type DatabaseSchemaTables = Readonly<Record<string, AnyTableComponent>>;
export type SchemaExtensions = Readonly<Record<string, AnyExtensionComponent>>;

export type DatabaseSchemaComponent<
  Tables extends DatabaseSchemaTables = DatabaseSchemaTables,
  SchemaName extends string | SQLDefaultSchemaNameToken =
    string | SQLDefaultSchemaNameToken,
  Extensions extends SchemaExtensions = SchemaExtensions,
> = SchemaComponent<typeof databaseSchemaComponentType> &
  Readonly<{
    schemaName: SchemaName;
    tables: Tables;
    extensions: Extensions;
  }>;

export type AnyDatabaseSchemaComponent = DatabaseSchemaComponent<
  DatabaseSchemaTables,
  string | SQLDefaultSchemaNameToken,
  SchemaExtensions
>;

export type DatabaseSchemaComponentOptions<
  Tables extends DatabaseSchemaTables,
  SchemaName extends string | SQLDefaultSchemaNameToken,
  Extensions extends SchemaExtensions,
> = Readonly<{
  schemaName: SchemaName;
  kind?: string | undefined;
  tables?: Tables | undefined;
  extensions?: Extensions | undefined;
  migrations?:
    | ((context: SchemaComponentContext) => ReadonlyArray<SQLMigration>)
    | undefined;
}>;

export const databaseSchemaComponent = <
  const Tables extends DatabaseSchemaTables = DatabaseSchemaTables,
  const SchemaName extends string | SQLDefaultSchemaNameToken = string,
  const Extensions extends SchemaExtensions = SchemaExtensions,
>(
  options: DatabaseSchemaComponentOptions<Tables, SchemaName, Extensions>,
): DatabaseSchemaComponent<Tables, SchemaName, Extensions> => {
  const tables = (options.tables ?? {}) as Tables;
  const extensions = (options.extensions ?? {}) as Extensions;
  const schemaNameLabel =
    typeof options.schemaName === 'string'
      ? options.schemaName
      : 'the default schema';
  if (options.schemaName === '')
    throw new Error(
      'A database schema name cannot be empty. Use the default schema token to leave it to the dialect',
    );
  const tableNames = new Set<string>();
  for (const table of Object.values(tables)) {
    if (tableNames.has(table.tableName)) {
      throw new Error(
        `Table "${table.tableName}" is declared more than once in database schema "${schemaNameLabel}"`,
      );
    }
    tableNames.add(table.tableName);
  }
  for (const extension of Object.values(extensions)) {
    const [contributedSchema] = Object.values(extension.schemas);
    if (contributedSchema === undefined) continue;

    const contributedSchemaName =
      typeof contributedSchema.schemaName === 'string'
        ? `"${contributedSchema.schemaName}"`
        : 'the default schema';
    throw new Error(
      `Extension "${extension.extensionName}" contributes database schema ${contributedSchemaName} and cannot be attached to database schema "${schemaNameLabel}"`,
    );
  }
  const children = Object.freeze([
    ...Object.values(tables),
    ...Object.values(extensions),
  ]);

  const component: DatabaseSchemaComponent<Tables, SchemaName, Extensions> = {
    ...schemaComponent(databaseSchemaComponentType, {
      components: children,
      context: (parent) => ({
        ...parent,
        databaseSchemaName: SQLDefaultSchemaNameToken.check(options.schemaName)
          ? (parent.defaults?.schemaName ?? SQLDefaultSchemaNameToken.from())
          : options.schemaName,
      }),
      migrations: (scoped) => {
        const databaseSchemaName = scoped.databaseSchemaName;
        const explicitMigrations = options.migrations?.(scoped) ?? [];
        const hasBaseline =
          scoped.skipGeneratedInitialMigrations === true ||
          explicitMigrations.some((migration) => migration.baseline === true);

        return [
          ...(hasBaseline ||
          databaseSchemaName === undefined ||
          SQLDefaultSchemaNameToken.check(databaseSchemaName)
            ? []
            : [
                sqlMigration(
                  databaseSchemaMigrationName(databaseSchemaName, options.kind),
                  [SQL`${SQLCreateSchema.from({ databaseSchemaName })}`],
                ),
              ]),
          ...explicitMigrations,
        ];
      },
    }),
    schemaName: options.schemaName,
    tables: schemaComponentMap(tables),
    extensions: schemaComponentMap(extensions),
  };

  return component;
};
