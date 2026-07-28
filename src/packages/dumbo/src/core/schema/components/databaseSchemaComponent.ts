import {
  copySchemaComponentSpecialization,
  createSchemaComponent,
  defineSchemaComponentRecord,
  localMigrationsOf,
  mergeComponentRecords,
  schemaComponentType,
  type AnySchemaComponent,
  type SchemaComponent,
  type SchemaComponentOptions,
} from '../schemaComponent';
import type { ExtensionComponent } from '../extensionComponent';
import {
  contextualTableComponent,
  type AnyTableComponent,
} from './tableComponent';

export const databaseSchemaComponentType: unique symbol = Symbol(
  'dumbo.schemaComponent.databaseSchema',
);

export type DatabaseSchemaTables = Readonly<Record<string, AnyTableComponent>>;
export type SchemaExtensions = Readonly<Record<string, ExtensionComponent>>;

type ContextualTables<Tables extends DatabaseSchemaTables> = {
  readonly [Key in keyof Tables]: Tables[Key] & {
    databaseSchemaName: string;
  };
};

export type DatabaseSchemaComponent<
  Tables extends DatabaseSchemaTables = DatabaseSchemaTables,
  SchemaName extends string | undefined = string | undefined,
  Extensions extends SchemaExtensions = SchemaExtensions,
> = SchemaComponent<typeof databaseSchemaComponentType> &
  Readonly<{
    schemaName: SchemaName;
    databaseName?: string;
    tables: SchemaName extends string ? ContextualTables<Tables> : Tables;
    extensions: Extensions;
  }>;

export type AnyDatabaseSchemaComponent = DatabaseSchemaComponent<
  DatabaseSchemaTables,
  string | undefined,
  SchemaExtensions
>;

export type DatabaseSchemaComponentOptions<
  Tables extends DatabaseSchemaTables,
  SchemaName extends string | undefined,
  Extensions extends SchemaExtensions,
> = Readonly<{
  schemaName?: SchemaName | undefined;
  databaseName?: string | undefined;
  tables?: Tables | undefined;
  extensions?: Extensions | undefined;
}> &
  Omit<SchemaComponentOptions, 'components'>;

export const databaseSchemaComponent = <
  const Tables extends DatabaseSchemaTables = DatabaseSchemaTables,
  const SchemaName extends string | undefined = undefined,
  const Extensions extends SchemaExtensions = SchemaExtensions,
>(
  options: DatabaseSchemaComponentOptions<Tables, SchemaName, Extensions>,
): DatabaseSchemaComponent<Tables, SchemaName, Extensions> => {
  const sourceTables = (options.tables ?? {}) as Tables;
  const tables =
    options.schemaName === undefined
      ? sourceTables
      : (Object.fromEntries(
          Object.entries(sourceTables).map(([alias, table]) => [
            alias,
            contextualTableComponent(table, options.schemaName as string),
          ]),
        ) as ContextualTables<Tables>);
  const extensions = (options.extensions ?? {}) as Extensions;
  const base = createSchemaComponent(databaseSchemaComponentType, {
    components: mergeComponentRecords(tables, extensions),
    migrations: options.migrations,
  });

  Object.defineProperties(base, {
    schemaName: { value: options.schemaName, enumerable: true },
    databaseName: { value: options.databaseName, enumerable: true },
  });
  defineSchemaComponentRecord(base, 'tables', tables);
  defineSchemaComponentRecord(base, 'extensions', extensions);

  return base as unknown as DatabaseSchemaComponent<
    Tables,
    SchemaName,
    Extensions
  >;
};

export const contextualDatabaseSchemaComponent = <
  Schema extends AnyDatabaseSchemaComponent,
>(
  schema: Schema,
  context: {
    databaseName?: string | undefined;
    schemaName: string;
  },
): Schema & { databaseName?: string; schemaName: string } => {
  if (
    context.databaseName !== undefined &&
    schema.databaseName !== undefined &&
    schema.databaseName !== context.databaseName
  ) {
    throw new Error(
      `Database schema "${context.schemaName}" is constrained to database "${schema.databaseName}" and cannot be placed in "${context.databaseName}"`,
    );
  }
  if (
    schema.schemaName !== undefined &&
    schema.schemaName !== context.schemaName
  ) {
    throw new Error(
      `Database schema record key "${context.schemaName}" conflicts with its explicit name "${schema.schemaName}"`,
    );
  }

  const contextual = databaseSchemaComponent({
    schemaName: context.schemaName,
    databaseName: context.databaseName ?? schema.databaseName,
    tables: schema.tables,
    extensions: schema.extensions,
    migrations: localMigrationsOf(schema),
  });
  copySchemaComponentSpecialization(schema, contextual, schemaProperties);
  return contextual as unknown as Schema & {
    databaseName?: string;
    schemaName: string;
  };
};

const schemaProperties = new Set<PropertyKey>([
  schemaComponentType,
  'components',
  'migrations',
  'schemaName',
  'databaseName',
  'tables',
  'extensions',
]);

export const isDatabaseSchemaComponent = (
  component: AnySchemaComponent,
): component is AnyDatabaseSchemaComponent =>
  component[schemaComponentType] === databaseSchemaComponentType;
