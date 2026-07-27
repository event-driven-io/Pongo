import {
  schemaComponent,
  type DatabaseDriverType,
  type SchemaComponent,
} from '@event-driven-io/dumbo';
import type { PongoCollectionSchemaComponent } from '../collection';
import type { PongoCollectionSQLBuilder } from '../collection';
import {
  pongoSchema,
  type PongoCollectionSchema,
  type PongoDbSchema,
} from '../schema';
import type { PongoDocument } from '../typing';

export type PongoDatabaseURNType = 'sc:pongo:database';
export type PongoDatabaseURN = `${PongoDatabaseURNType}:${string}`;
export const PongoDatabaseURNType: PongoDatabaseURNType = 'sc:pongo:database';

export type PongoDatabaseSchemaComponent<
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  DriverType extends DatabaseDriverType = DatabaseDriverType,
  T extends Record<string, PongoCollectionSchema> = Record<
    string,
    PongoCollectionSchema
  >,
> = SchemaComponent<PongoDatabaseURN> & {
  definition: PongoDbSchema<T>;
  collections: ReadonlyArray<PongoCollectionSchemaComponent>;

  collection: <T extends PongoDocument = PongoDocument>(
    schema: PongoCollectionSchema<T>,
  ) => PongoCollectionSchemaComponent;
};

export type PongoDatabaseSchemaComponentOptions<
  DriverType extends DatabaseDriverType = DatabaseDriverType,
  T extends Record<string, PongoCollectionSchema> = Record<
    string,
    PongoCollectionSchema
  >,
> = Readonly<{
  driverType: DriverType;
  definition: PongoDbSchema<T>;
  collectionFactory: <T extends PongoDocument = PongoDocument>(
    schema: PongoCollectionSchema<T>,
  ) => PongoCollectionSchemaComponent;
}>;

export const PongoDatabaseSchemaComponent = <
  DriverType extends DatabaseDriverType = DatabaseDriverType,
>({
  definition,
  collectionFactory,
}: PongoDatabaseSchemaComponentOptions<DriverType>): PongoDatabaseSchemaComponent => {
  const collections: PongoCollectionSchemaComponent[] =
    Object.values(definition.collections).map(collectionFactory) ?? [];
  const base = schemaComponent(`${PongoDatabaseURNType}:${definition.name}`, {
    components: collections,
  });

  return {
    ...base,
    get migrations() {
      return collections.flatMap((collection) => collection.migrations);
    },
    get components() {
      return new Map(
        collections.map((collection) => [
          collection.schemaComponentKey,
          collection,
        ]),
      );
    },
    definition,
    collections,

    collection: <T extends PongoDocument = PongoDocument>(
      schema: PongoCollectionSchema<T>,
    ) => {
      const existing = collections.find(
        (c) => c.collectionName === schema.name,
      );

      if (existing) return existing;

      const newCollection = collectionFactory(
        pongoSchema.collection(schema.name),
      );
      collections.push(newCollection);
      definition.collections[schema.name] = schema;
      return newCollection;
    },
  };
};

export type PongoDatabaseSQLBuilder<
  DriverType extends DatabaseDriverType = DatabaseDriverType,
> = {
  driverType: DriverType;
  collection: PongoCollectionSQLBuilder;
};

export type PongoCollectionsFeatureKind = 'pongo_collections';

export type PongoCollectionsSchemaComponent<
  FeatureName extends string = string,
> = SchemaComponent<
  `sc:dumbo:feature:${PongoCollectionsFeatureKind}:${FeatureName}`
> & {
  featureKind: PongoCollectionsFeatureKind;
  featureName: FeatureName;
  visibility: 'opaque';
  definition: PongoDbSchema;
  database: PongoDatabaseSchemaComponent;
};

export type PongoCollectionsSchemaOptions<
  DriverType extends DatabaseDriverType = DatabaseDriverType,
> = Omit<PongoDatabaseSchemaComponentOptions<DriverType>, 'definition'>;

export const pongoCollectionsSchema = <
  const FeatureName extends string = string,
  DriverType extends DatabaseDriverType = DatabaseDriverType,
>(
  name: FeatureName,
  definition: PongoDbSchema,
  options: PongoCollectionsSchemaOptions<DriverType>,
): PongoCollectionsSchemaComponent<FeatureName> => {
  const databaseDefinition = {
    ...definition,
    name: definition.name ?? name,
  };
  const database = PongoDatabaseSchemaComponent({
    ...options,
    definition: databaseDefinition,
  });
  const base = schemaComponent(
    `sc:dumbo:feature:pongo_collections:${name}`,
    {
      components: [database],
    },
  );

  return {
    ...base,
    get migrations() {
      return base.migrations;
    },
    get components() {
      return base.components;
    },
    featureKind: 'pongo_collections',
    featureName: name,
    visibility: 'opaque',
    definition: databaseDefinition,
    database,
  };
};
