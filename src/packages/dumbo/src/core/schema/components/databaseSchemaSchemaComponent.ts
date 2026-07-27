import {
  mapSchemaComponentsOfType,
  schemaComponent,
  type SchemaComponent,
  type SchemaComponentOptions,
} from '../schemaComponent';
import {
  FeatureSchemaComponentURNType,
  type DatabaseSchemaFeatureSchemaComponent,
} from '../featureSchemaComponent';
import {
  bindTableToDatabaseSchema,
  type BindTablesToDatabaseSchema,
  TableURNType,
  tableSchemaComponent,
  type AnyTableSchemaComponent,
  type TableSchemaComponent,
} from './tableSchemaComponent';

export type DatabaseSchemaURNType = 'sc:dumbo:database_schema';
export type DatabaseSchemaKind = 'regular';
export const DatabaseSchemaKind: DatabaseSchemaKind = 'regular';
export const DEFAULT_DATABASE_NAME = '__default_database__';

export type DatabaseSchemaURN<
  SchemaKind extends string = string,
  DatabaseName extends string = string,
  SchemaName extends string = string,
> = `${DatabaseSchemaURNType}:${SchemaKind}:${DatabaseName}:${SchemaName}`;

export const DatabaseSchemaURNType: DatabaseSchemaURNType =
  'sc:dumbo:database_schema';
export const DatabaseSchemaURN = <
  SchemaKind extends string = string,
  DatabaseName extends string = string,
  SchemaName extends string = string,
>({
  kind,
  databaseName,
  name,
}: {
  kind: SchemaKind;
  databaseName: DatabaseName;
  name: SchemaName;
}): DatabaseSchemaURN<SchemaKind, DatabaseName, SchemaName> =>
  `${DatabaseSchemaURNType}:${kind}:${databaseName}:${name}`;

export type DatabaseSchemaTables<
  Tables extends AnyTableSchemaComponent = AnyTableSchemaComponent,
> = Record<string, Tables>;

export type DatabaseSchemaFeatures<
  Features extends DatabaseSchemaFeatureSchemaComponent =
    DatabaseSchemaFeatureSchemaComponent,
> = Record<string, Features>;

export type DatabaseSchemaSchemaComponent<
  Tables extends DatabaseSchemaTables = DatabaseSchemaTables,
  SchemaName extends string = string,
  DatabaseName extends string = string,
  SchemaKind extends string = DatabaseSchemaKind,
  Features extends DatabaseSchemaFeatures = DatabaseSchemaFeatures,
> = SchemaComponent<
  DatabaseSchemaURN<SchemaKind, DatabaseName, SchemaName>,
  Readonly<{
    schemaKind: SchemaKind;
    databaseName: DatabaseName;
    schemaName: SchemaName;
    tables: ReadonlyMap<string, TableSchemaComponent> &
      BindTablesToDatabaseSchema<Tables, SchemaName>;
    features: ReadonlyMap<string, DatabaseSchemaFeatureSchemaComponent> &
      Features;
    addTable: (table: string | TableSchemaComponent) => TableSchemaComponent;
  }>
>;

export type AnyDatabaseSchemaSchemaComponent =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DatabaseSchemaSchemaComponent<any, any, any, any, any>;

export const databaseSchemaSchemaComponent = <
  const Tables extends DatabaseSchemaTables = DatabaseSchemaTables,
  const SchemaName extends string = string,
  const DatabaseName extends string = typeof DEFAULT_DATABASE_NAME,
  const SchemaKind extends string = DatabaseSchemaKind,
  const Features extends DatabaseSchemaFeatures = DatabaseSchemaFeatures,
>({
  schemaName,
  databaseName,
  schemaKind,
  tables,
  features,
  ...migrationsOrComponents
}: {
  schemaName: SchemaName;
  databaseName?: DatabaseName;
  schemaKind?: SchemaKind;
  tables?: Tables;
  features?: Features;
} & SchemaComponentOptions): DatabaseSchemaSchemaComponent<
  Tables,
  SchemaName,
  DatabaseName,
  SchemaKind,
  Features
> => {
  features ??= {} as Features;
  databaseName ??= DEFAULT_DATABASE_NAME as DatabaseName;
  schemaKind ??= DatabaseSchemaKind as SchemaKind;
  const boundTables = Object.fromEntries(
    Object.entries(tables ?? {}).map(([key, table]) => [
      key,
      bindTableToDatabaseSchema(table, schemaName),
    ]),
  ) as BindTablesToDatabaseSchema<Tables, SchemaName>;
  const tableComponents = Object.values(boundTables) as TableSchemaComponent[];
  const featureComponents = Object.values(features);

  const base = schemaComponent(
    DatabaseSchemaURN({ kind: schemaKind, databaseName, name: schemaName }),
    {
      migrations: migrationsOrComponents.migrations ?? [],
      components: [
        ...(migrationsOrComponents.components ?? []),
        ...tableComponents,
        ...featureComponents,
      ],
    },
  );

  return {
    ...base,
    schemaKind,
    databaseName,
    schemaName,
    get tables() {
      const tablesMap = mapSchemaComponentsOfType<TableSchemaComponent>(
        base.components,
        TableURNType,
        (c) => c.tableName,
      );

      return Object.assign(tablesMap, boundTables);
    },
    get features() {
      const featuresMap =
        mapSchemaComponentsOfType<DatabaseSchemaFeatureSchemaComponent>(
          base.components,
          FeatureSchemaComponentURNType,
          (c) => c.featureName,
        );

      return Object.assign(featuresMap, features);
    },
    addTable: (table: string | TableSchemaComponent) =>
      base.addComponent(
        typeof table === 'string'
          ? tableSchemaComponent({ tableName: table })
          : table,
      ),
  };
};
