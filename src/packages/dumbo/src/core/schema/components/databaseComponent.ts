import {
  createSchemaComponent,
  defineSchemaComponentRecord,
  mergeComponentRecords,
  schemaComponentType,
  type AnySchemaComponent,
  type SchemaComponent,
  type SchemaComponentOptions,
} from '../schemaComponent';
import type { ExtensionComponent } from '../extensionComponent';
import {
  contextualDatabaseSchemaComponent,
  type AnyDatabaseSchemaComponent,
} from './databaseSchemaComponent';

export const databaseComponentType: unique symbol = Symbol(
  'dumbo.schemaComponent.database',
);

export type DatabaseSchemas = Readonly<
  Record<string, AnyDatabaseSchemaComponent>
>;
export type DatabaseExtensions = Readonly<Record<string, ExtensionComponent>>;

type ContextualSchemas<
  Schemas extends DatabaseSchemas,
  DatabaseName extends string | undefined,
> = {
  readonly [Key in keyof Schemas]: Omit<
    Schemas[Key],
    'databaseName' | 'schemaName'
  > & {
    schemaName: Key & string;
  } & (DatabaseName extends string
      ? { databaseName: DatabaseName }
      : { databaseName?: string });
};

export type DatabaseComponent<
  Schemas extends DatabaseSchemas = DatabaseSchemas,
  DatabaseName extends string | undefined = string | undefined,
  Extensions extends DatabaseExtensions = DatabaseExtensions,
> = SchemaComponent<typeof databaseComponentType> &
  Readonly<{
    databaseName: DatabaseName;
    schemas: ContextualSchemas<Schemas, DatabaseName>;
    extensions: Extensions;
  }>;

export type AnyDatabaseComponent = DatabaseComponent<
  DatabaseSchemas,
  string | undefined,
  DatabaseExtensions
>;

export type DatabaseComponentOptions<
  Schemas extends DatabaseSchemas,
  DatabaseName extends string | undefined,
  Extensions extends DatabaseExtensions,
> = Readonly<{
  databaseName?: DatabaseName | undefined;
  schemas?: Schemas | undefined;
  extensions?: Extensions | undefined;
}> &
  Omit<SchemaComponentOptions, 'components'>;

export const databaseComponent = <
  const Schemas extends DatabaseSchemas = DatabaseSchemas,
  const DatabaseName extends string | undefined = undefined,
  const Extensions extends DatabaseExtensions = DatabaseExtensions,
>(
  options: DatabaseComponentOptions<Schemas, DatabaseName, Extensions>,
): DatabaseComponent<Schemas, DatabaseName, Extensions> => {
  const sourceSchemas = (options.schemas ?? {}) as Schemas;
  const databaseName = options.databaseName;
  const contextualSchemas = Object.fromEntries(
    Object.entries(sourceSchemas).map(([schemaName, schema]) => [
      schemaName,
      contextualDatabaseSchemaComponent(schema, {
        schemaName,
        databaseName,
      }),
    ]),
  ) as unknown as ContextualSchemas<Schemas, DatabaseName>;
  const extensions = (options.extensions ?? {}) as Extensions;
  const base = createSchemaComponent(databaseComponentType, {
    components: mergeComponentRecords(contextualSchemas, extensions),
    migrations: options.migrations,
  });

  Object.defineProperty(base, 'databaseName', {
    value: databaseName,
    enumerable: true,
  });
  defineSchemaComponentRecord(base, 'schemas', contextualSchemas);
  defineSchemaComponentRecord(base, 'extensions', extensions);

  return base as unknown as DatabaseComponent<
    Schemas,
    DatabaseName,
    Extensions
  >;
};

export const isDatabaseComponent = (
  component: AnySchemaComponent,
): component is AnyDatabaseComponent =>
  component[schemaComponentType] === databaseComponentType;
