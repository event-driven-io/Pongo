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
export type DatabaseURN = `${DatabaseURNType}:${string}`;

export const DatabaseURNType: DatabaseURNType = 'sc:dumbo:database';
export const DatabaseURN = ({ name }: { name: string }): DatabaseURN =>
  `${DatabaseURNType}:${name}`;

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
  Features extends DatabaseFeatures = DatabaseFeatures,
> = SchemaComponent<
  DatabaseURN,
  Readonly<{
    databaseName: string;
    schemas: ReadonlyMap<string, DatabaseSchemaSchemaComponent> & Schemas;
    features: ReadonlyMap<string, DatabaseFeatureSchemaComponent> & Features;
    addSchema: (
      schema: string | DatabaseSchemaSchemaComponent,
    ) => DatabaseSchemaSchemaComponent;
  }>
>;

export type AnyDatabaseSchemaComponent =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DatabaseSchemaComponent<any, any>;

export const databaseSchemaComponent = <
  Schemas extends DatabaseSchemas = DatabaseSchemas,
  Features extends DatabaseFeatures = DatabaseFeatures,
>({
  databaseName,
  schemas,
  features,
  ...migrationsOrComponents
}: {
  databaseName: string;
  schemas?: Schemas;
  features?: Features;
} & SchemaComponentOptions): DatabaseSchemaComponent<Schemas, Features> => {
  schemas ??= {} as Schemas;
  features ??= {} as Features;

  const base = schemaComponent(DatabaseURN({ name: databaseName }), {
    migrations: migrationsOrComponents.migrations ?? [],
    components: [
      ...(migrationsOrComponents.components ?? []),
      ...Object.values(schemas),
      ...Object.values(features),
    ],
  });

  return {
    ...base,
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
