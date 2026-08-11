import {
  SQL,
  SQLCreateSchema,
  type SQLDefaultSchemaNameToken,
} from '../../sql';
import type { ExtensionComponent } from '../extensionComponent';
import {
  dedupeMigrations,
  schemaComponentMap,
  schemaComponentType,
  type AnySchemaComponent,
  type SchemaComponent,
  type SchemaComponentContext,
  type SchemaComponentOptions,
} from '../schemaComponent';
import { sqlMigration } from '../sqlMigration';
import { databaseSchemaMigrationName } from './migrationNames';
import type { AnyTableComponent } from './tableComponent';

export const databaseSchemaComponentType: unique symbol = Symbol(
  'dumbo.schemaComponent.databaseSchema',
);

export type DatabaseSchemaTables = Readonly<Record<string, AnyTableComponent>>;
export type SchemaExtensions = Readonly<Record<string, ExtensionComponent>>;

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
  tables?: Tables | undefined;
  extensions?: Extensions | undefined;
}> &
  Omit<SchemaComponentOptions, 'components'>;

export const databaseSchemaComponent = <
  const Tables extends DatabaseSchemaTables = DatabaseSchemaTables,
  const SchemaName extends string | SQLDefaultSchemaNameToken = string,
  const Extensions extends SchemaExtensions = SchemaExtensions,
>(
  options: DatabaseSchemaComponentOptions<Tables, SchemaName, Extensions>,
): DatabaseSchemaComponent<Tables, SchemaName, Extensions> => {
  const tables = (options.tables ?? {}) as Tables;
  const extensions = (options.extensions ?? {}) as Extensions;
  if (options.schemaName === '')
    throw new Error(
      'A database schema name cannot be empty. Use the default schema token to leave it to the dialect',
    );
  for (const table of Object.values(tables)) {
    if (
      table.databaseSchemaName !== undefined &&
      table.databaseSchemaName !== options.schemaName
    ) {
      throw new Error(
        `Table "${table.tableName}" is constrained to database schema "${table.databaseSchemaName}" and cannot be placed in "${typeof options.schemaName === 'string' ? options.schemaName : 'the default schema'}"`,
      );
    }
  }
  const children = Object.freeze([
    ...Object.values(tables),
    ...Object.values(extensions),
  ]);

  const component: DatabaseSchemaComponent<Tables, SchemaName, Extensions> = {
    [schemaComponentType]: databaseSchemaComponentType,
    schemaName: options.schemaName,
    tables: schemaComponentMap(tables),
    extensions: schemaComponentMap(extensions),
    components: children,
    migrations: (context: SchemaComponentContext = {}) => {
      const scoped = { ...context, databaseSchemaName: options.schemaName };

      return dedupeMigrations([
        sqlMigration(
          databaseSchemaMigrationName(
            options.schemaName,
            scoped.migrationNamePrefixes,
          ),
          [
            SQL`${SQLCreateSchema.from({
              databaseSchemaName: options.schemaName,
            })}`,
          ],
        ),
        ...(options.migrations?.(scoped) ?? []),
        ...children.flatMap((child) => child.migrations(scoped)),
      ]);
    },
  };

  return component;
};

export const isDatabaseSchemaComponent = (
  component: AnySchemaComponent,
): component is AnyDatabaseSchemaComponent =>
  component[schemaComponentType] === databaseSchemaComponentType;
