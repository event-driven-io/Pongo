import {
  dumboSchema,
  findComponents,
  schemaComponent,
  type DatabaseDriverType,
  type AnySchemaComponent,
  type SchemaComponent,
} from '@event-driven-io/dumbo';
import type { PongoCollectionSchemaComponent } from '../collection';
import type { PongoCollectionSQLBuilder } from '../collection';
import {
  pongoSchema,
  type PongoCollectionSchema,
  type PongoClientSchema,
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

export type PongoSchemaDefinition<
  T extends Record<string, PongoCollectionSchema> = Record<
    string,
    PongoCollectionSchema
  >,
> = PongoDbSchema<T> | AnySchemaComponent;

export const isPongoDbSchema = <
  T extends Record<string, PongoCollectionSchema> = Record<
    string,
    PongoCollectionSchema
  >,
>(
  definition: PongoSchemaDefinition<T> | undefined,
): definition is PongoDbSchema<T> =>
  definition !== undefined &&
  'collections' in definition &&
  !('schemaComponentKey' in definition);

export const isPongoDatabaseSchemaComponent = (
  component: AnySchemaComponent,
): component is PongoDatabaseSchemaComponent =>
  component.schemaComponentKey.startsWith(`${PongoDatabaseURNType}:`);

export const PongoDatabaseSchemaComponent = <
  DriverType extends DatabaseDriverType = DatabaseDriverType,
  T extends Record<string, PongoCollectionSchema> = Record<
    string,
    PongoCollectionSchema
  >,
>({
  definition,
  collectionFactory,
}: PongoDatabaseSchemaComponentOptions<
  DriverType,
  T
>): PongoDatabaseSchemaComponent<DriverType, T> => {
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
      const databaseSchemaName =
        schema.databaseSchema ?? dumboSchema.schema.defaultName;
      const existing = collections.find(
        (c) =>
          c.collectionName === schema.name &&
          c.databaseSchemaName === databaseSchemaName,
      );

      if (existing) return existing;

      const newCollection = collectionFactory(schema);
      collections.push(newCollection);
      (definition.collections as Record<string, PongoCollectionSchema>)[
        schema.name
      ] = schema;
      return newCollection;
    },
  };
};

export const pongoDatabaseSchemaComponentFor = <
  DriverType extends DatabaseDriverType = DatabaseDriverType,
  T extends Record<string, PongoCollectionSchema> = Record<
    string,
    PongoCollectionSchema
  >,
>({
  databaseName,
  definition,
  ...options
}: Omit<PongoDatabaseSchemaComponentOptions<DriverType, T>, 'definition'> & {
  databaseName: string;
  definition?: PongoSchemaDefinition<T> | undefined;
}): PongoDatabaseSchemaComponent<DriverType, T> => {
  if (definition === undefined || isPongoDbSchema(definition)) {
    const databaseDefinition: PongoDbSchema<T> = {
      ...(definition ?? pongoSchema.db(databaseName, {} as T)),
      name: definition?.name ?? databaseName,
    };

    return PongoDatabaseSchemaComponent({
      ...options,
      definition: databaseDefinition,
    });
  }

  const databases = findComponents<PongoDatabaseSchemaComponent>(
    definition,
    isPongoDatabaseSchemaComponent,
  ) as PongoDatabaseSchemaComponent<DriverType, T>[];

  const exact = databases.find(
    (database) =>
      database.definition.name === databaseName ||
      database.schemaComponentKey === `${PongoDatabaseURNType}:${databaseName}`,
  );

  if (exact) return exact;

  if (databases.length === 1) {
    return databases[0] as PongoDatabaseSchemaComponent<DriverType, T>;
  }

  if (databases.length === 0) {
    throw new Error(
      `Pongo schema component not found in schema definition for database: ${databaseName}`,
    );
  }

  throw new Error(
    `Multiple Pongo schema components found in schema definition for database ${databaseName}: ${databases
      .map((database) => database.schemaComponentKey)
      .join(', ')}`,
  );
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
  T extends Record<string, PongoCollectionSchema> = Record<
    string,
    PongoCollectionSchema
  >,
> = SchemaComponent<`sc:dumbo:feature:${PongoCollectionsFeatureKind}:${FeatureName}`> & {
  featureKind: PongoCollectionsFeatureKind;
  featureName: FeatureName;
  visibility: 'opaque';
  definition: PongoDbSchema<T>;
  database: PongoDatabaseSchemaComponent<DatabaseDriverType, T>;
};

type PongoDatabaseSchemaKey<T extends PongoDbSchema> = T['name'] extends string
  ? T['name']
  : typeof pongoSchema.database.defaultName;

export type PongoClientSchemaFromDefinition<T> = T extends PongoClientSchema
  ? T
  : T extends PongoDbSchema
    ? PongoClientSchema<{ [K in PongoDatabaseSchemaKey<T>]: T }>
    : PongoClientSchema;

export const isPongoCollectionsSchemaComponent = (
  component: AnySchemaComponent,
): component is PongoCollectionsSchemaComponent =>
  component.schemaComponentKey.startsWith(
    'sc:dumbo:feature:pongo_collections:',
  );

export const pongoClientSchemaFromDefinition = (
  definition:
    PongoClientSchema | PongoDbSchema | AnySchemaComponent | undefined,
): PongoClientSchema | undefined => {
  if (definition === undefined) return undefined;

  if (!('schemaComponentKey' in definition)) {
    if ('dbs' in definition) return definition;

    return pongoSchema.client({
      [definition.name ?? pongoSchema.database.defaultName]: definition,
    });
  }

  const features = findComponents<PongoCollectionsSchemaComponent>(
    definition,
    isPongoCollectionsSchemaComponent,
  );

  if (features.length === 0) return undefined;

  return pongoSchema.client(
    Object.fromEntries(
      features.map((feature) => [feature.featureName, feature.definition]),
    ),
  );
};

export type PongoCollectionsSchemaOptions<
  DriverType extends DatabaseDriverType = DatabaseDriverType,
> = Omit<PongoDatabaseSchemaComponentOptions<DriverType>, 'definition'>;

export const pongoCollectionsSchema = <
  const FeatureName extends string = string,
  T extends Record<string, PongoCollectionSchema> = Record<
    string,
    PongoCollectionSchema
  >,
  DriverType extends DatabaseDriverType = DatabaseDriverType,
>(
  name: FeatureName,
  definition: PongoDbSchema<T>,
  options: PongoCollectionsSchemaOptions<DriverType>,
): PongoCollectionsSchemaComponent<FeatureName, T> => {
  const databaseDefinition = {
    ...definition,
    name: definition.name ?? name,
  };
  const database = PongoDatabaseSchemaComponent({
    ...options,
    definition: databaseDefinition,
  });
  const base = schemaComponent(`sc:dumbo:feature:pongo_collections:${name}`, {
    components: [database],
  });

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
    database: database,
  };
};
