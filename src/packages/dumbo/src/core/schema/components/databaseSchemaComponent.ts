import {
  mapSchemaComponentsOfType,
  schemaComponent,
  type SchemaComponent,
  type SchemaComponentOptions,
} from '../schemaComponent';
import {
  FeatureSchemaComponentURNType,
  type DatabaseFeatureSchemaComponent,
} from '../featureSchemaComponent';
import {
  DatabaseSchemaURNType,
  databaseSchemaSchemaComponent,
  type AnyDatabaseSchemaSchemaComponent,
  type DatabaseSchemaSchemaComponent,
} from './databaseSchemaSchemaComponent';

export type DatabaseURNType = 'sc:dumbo:database';
export type DatabaseKind = 'regular';
export const DatabaseKind: DatabaseKind = 'regular';
export type DatabaseURN<
  DatabaseKindName extends string = string,
  DatabaseName extends string = string,
> = `${DatabaseURNType}:${DatabaseKindName}:${DatabaseName}`;

export const DatabaseURNType: DatabaseURNType = 'sc:dumbo:database';
export const DatabaseURN = <
  DatabaseKindName extends string = string,
  DatabaseName extends string = string,
>({
  kind,
  name,
}: {
  kind: DatabaseKindName;
  name: DatabaseName;
}): DatabaseURN<DatabaseKindName, DatabaseName> =>
  `${DatabaseURNType}:${kind}:${name}`;

export type DatabaseSchemas<
  Schemas extends AnyDatabaseSchemaSchemaComponent =
    AnyDatabaseSchemaSchemaComponent,
> = Record<string, Schemas>;

export type DatabaseFeatures<
  Features extends DatabaseFeatureSchemaComponent =
    DatabaseFeatureSchemaComponent,
> = Record<string, Features>;

export type DatabaseSchemaComponent<
  Schemas extends DatabaseSchemas = DatabaseSchemas,
  DatabaseName extends string = string,
  DatabaseKindName extends string = DatabaseKind,
  Features extends DatabaseFeatures = DatabaseFeatures,
> = SchemaComponent<
  DatabaseURN<DatabaseKindName, DatabaseName>,
  Readonly<{
    databaseKind: DatabaseKindName;
    databaseName: DatabaseName;
    schemas: ReadonlyMap<string, DatabaseSchemaSchemaComponent> & Schemas;
    features: ReadonlyMap<string, DatabaseFeatureSchemaComponent> & Features;
    addSchema: (
      schema: string | DatabaseSchemaSchemaComponent,
    ) => DatabaseSchemaSchemaComponent;
  }>
>;

export type AnyDatabaseSchemaComponent =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DatabaseSchemaComponent<any, any, any, any>;

export const databaseSchemaComponent = <
  Schemas extends DatabaseSchemas = DatabaseSchemas,
  const DatabaseName extends string = string,
  const DatabaseKindName extends string = DatabaseKind,
  Features extends DatabaseFeatures = DatabaseFeatures,
>({
  databaseName,
  databaseKind,
  schemas,
  features,
  ...migrationsOrComponents
}: {
  databaseName: DatabaseName;
  databaseKind?: DatabaseKindName;
  schemas?: Schemas;
  features?: Features;
} & SchemaComponentOptions): DatabaseSchemaComponent<
  Schemas,
  DatabaseName,
  DatabaseKindName,
  Features
> => {
  schemas ??= {} as Schemas;
  features ??= {} as Features;
  databaseKind ??= DatabaseKind as DatabaseKindName;

  const base = schemaComponent(
    DatabaseURN({ kind: databaseKind, name: databaseName }),
    {
      migrations: migrationsOrComponents.migrations ?? [],
      components: [
        ...(migrationsOrComponents.components ?? []),
        ...Object.values(schemas),
        ...Object.values(features),
      ],
    },
  );

  return {
    ...base,
    databaseKind,
    databaseName,
    get schemas() {
      const schemasMap =
        mapSchemaComponentsOfType<DatabaseSchemaSchemaComponent>(
          base.components,
          DatabaseSchemaURNType,
          (c) => c.schemaName,
        );

      return Object.assign(schemasMap, schemas);
    },
    get features() {
      const featuresMap =
        mapSchemaComponentsOfType<DatabaseFeatureSchemaComponent>(
          base.components,
          FeatureSchemaComponentURNType,
          (c) => c.featureName,
        );

      return Object.assign(featuresMap, features);
    },
    addSchema: (schema: string | DatabaseSchemaSchemaComponent) =>
      base.addComponent(
        typeof schema === 'string'
          ? databaseSchemaSchemaComponent({ schemaName: schema })
          : schema,
      ),
  };
};
