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
  TableURNType,
  tableSchemaComponent,
  type AnyTableSchemaComponent,
  type TableSchemaComponent,
} from './tableSchemaComponent';

export type DatabaseSchemaURNType = 'sc:dumbo:database_schema';
export type DatabaseSchemaURN<SchemaName extends string = string> =
  `${DatabaseSchemaURNType}:${SchemaName}`;

export const DatabaseSchemaURNType: DatabaseSchemaURNType =
  'sc:dumbo:database_schema';
export const DatabaseSchemaURN = <SchemaName extends string = string>({
  name,
}: {
  name: SchemaName;
}): DatabaseSchemaURN<SchemaName> => `${DatabaseSchemaURNType}:${name}`;

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
  Features extends DatabaseSchemaFeatures = DatabaseSchemaFeatures,
> = SchemaComponent<
  DatabaseSchemaURN<SchemaName>,
  Readonly<{
    schemaName: SchemaName;
    tables: ReadonlyMap<string, TableSchemaComponent> & Tables;
    features: ReadonlyMap<string, DatabaseSchemaFeatureSchemaComponent> &
      Features;
    addTable: (table: string | TableSchemaComponent) => TableSchemaComponent;
  }>
>;

export type AnyDatabaseSchemaSchemaComponent =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DatabaseSchemaSchemaComponent<any, any, any>;

export const databaseSchemaSchemaComponent = <
  const Tables extends DatabaseSchemaTables = DatabaseSchemaTables,
  const SchemaName extends string = string,
  const Features extends DatabaseSchemaFeatures = DatabaseSchemaFeatures,
>({
  schemaName,
  tables,
  features,
  ...migrationsOrComponents
}: {
  schemaName: SchemaName;
  tables?: Tables;
  features?: Features;
} & SchemaComponentOptions): DatabaseSchemaSchemaComponent<
  Tables,
  SchemaName,
  Features
> => {
  features ??= {} as Features;

  const base = schemaComponent(DatabaseSchemaURN({ name: schemaName }), {
    migrations: migrationsOrComponents.migrations ?? [],
    components: [
      ...(migrationsOrComponents.components ?? []),
      ...Object.values(tables ?? {}),
      ...Object.values(features),
    ],
  });

  return {
    ...base,
    schemaName,
    get tables() {
      const tablesMap = mapSchemaComponentsOfType<TableSchemaComponent>(
        base.components,
        TableURNType,
        (c) => c.tableName,
      );

      return Object.assign(tablesMap, tables);
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
