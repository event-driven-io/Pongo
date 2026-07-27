import {
  databaseSchemaComponent,
  findComponents,
  schemaComponent,
  type DatabaseDriverType,
  type AnySchemaComponent,
  type DatabaseFeatureSchemaComponent,
  type DatabaseSchemas,
  type DatabaseSchemaComponent as DumboDatabaseSchemaComponent,
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

export type PongoDatabaseKind = 'pongo';
export const PongoDatabaseKind: PongoDatabaseKind = 'pongo';

export type PongoDatabaseSchemaComponent<
  DriverType extends DatabaseDriverType = DatabaseDriverType,
  T extends Record<string, PongoCollectionSchema> = Record<
    string,
    PongoCollectionSchema
  >,
> = Omit<
  DumboDatabaseSchemaComponent<
    DatabaseSchemas,
    string,
    PongoDatabaseKind,
    Record<string, DatabaseFeatureSchemaComponent>
  >,
  'databaseKind'
> & {
  databaseKind: PongoDatabaseKind;
  driverType: DriverType;
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

export const isPongoDbSchema = <
  T extends Record<string, PongoCollectionSchema> = Record<
    string,
    PongoCollectionSchema
  >,
>(
  definition: PongoDbSchema<T> | undefined,
): definition is PongoDbSchema<T> =>
  definition !== undefined &&
  'collections' in definition &&
  !('schemaComponentKey' in definition);

export const isPongoDatabaseSchemaComponent = (
  component: AnySchemaComponent,
): component is PongoDatabaseSchemaComponent =>
  component.databaseKind === PongoDatabaseKind ||
  component.schemaComponentKey.startsWith(
    `sc:dumbo:database:${PongoDatabaseKind}:`,
  );

const isPongoCollectionSchemaComponent = (
  component: AnySchemaComponent,
): component is PongoCollectionSchemaComponent =>
  (component as { tableKind?: unknown }).tableKind === 'pongo_collection';

export const PongoDatabaseSchemaComponent = <
  DriverType extends DatabaseDriverType = DatabaseDriverType,
  T extends Record<string, PongoCollectionSchema> = Record<
    string,
    PongoCollectionSchema
  >,
>({
  driverType,
  definition,
  collectionFactory,
}: PongoDatabaseSchemaComponentOptions<
  DriverType,
  T
>): PongoDatabaseSchemaComponent<DriverType, T> => {
  const definitions = definition.schemas
    ? Object.values(definition.schemas).flatMap((schema) =>
        Object.values(schema.collections),
      )
    : Object.values(definition.collections);
  const collectionComponents = definitions.map(collectionFactory) ?? [];
  const base = databaseSchemaComponent({
    databaseName: definition.name ?? '',
    databaseKind: PongoDatabaseKind,
    components: collectionComponents,
  }) as unknown as DumboDatabaseSchemaComponent<
    DatabaseSchemas,
    string,
    PongoDatabaseKind,
    Record<string, DatabaseFeatureSchemaComponent>
  >;

  const component = Object.assign(base, {
    driverType,
    definition,

    collection: <T extends PongoDocument = PongoDocument>(
      schema: PongoCollectionSchema<T>,
    ) => {
      const databaseSchemaName = schema.databaseSchemaName;
      const existing = Array.from(base.components.values()).find(
        (c) =>
          (c as PongoCollectionSchemaComponent).collectionName ===
            schema.tableName &&
          (c as PongoCollectionSchemaComponent).databaseSchemaName ===
            databaseSchemaName,
      ) as PongoCollectionSchemaComponent | undefined;

      if (existing) return existing;

      const newCollection = collectionFactory(schema);
      base.addComponent(newCollection);
      (definition.collections as Record<string, PongoCollectionSchema>)[
        schema.tableName
      ] = schema;
      return newCollection;
    },
  }) as PongoDatabaseSchemaComponent<DriverType, T>;

  Object.defineProperty(component, 'collections', {
    get: () =>
      Array.from(base.components.values()).filter(
        isPongoCollectionSchemaComponent,
      ),
    enumerable: true,
    configurable: true,
  });

  return component;
};

export const pongoDatabaseSchemaFromPongoSchema = <
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
  definition?: PongoDbSchema<T> | undefined;
}): PongoDatabaseSchemaComponent<DriverType, T> => {
  const databaseDefinition: PongoDbSchema<T> = {
    ...(definition ?? pongoSchema.db(databaseName, {} as T)),
    name: definition?.name ?? databaseName,
  };

  return PongoDatabaseSchemaComponent({
    ...options,
    definition: databaseDefinition,
  });
};

export const pongoDatabaseSchemaFromDumboComponent = <
  DriverType extends DatabaseDriverType = DatabaseDriverType,
  T extends Record<string, PongoCollectionSchema> = Record<
    string,
    PongoCollectionSchema
  >,
>({
  databaseName,
  definition,
}: {
  databaseName: string;
  definition: AnySchemaComponent;
}): PongoDatabaseSchemaComponent<DriverType, T> => {
  const databases = findComponents<PongoDatabaseSchemaComponent>(
    definition,
    isPongoDatabaseSchemaComponent,
  ) as PongoDatabaseSchemaComponent<DriverType, T>[];

  const exact = databases.find(
    (database) =>
      database.definition.name === databaseName ||
      database.schemaComponentKey ===
        `sc:dumbo:database:${PongoDatabaseKind}:${databaseName}`,
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

export const pongoClientSchemaFromDumboComponent = (
  definition: AnySchemaComponent | undefined,
): PongoClientSchema | undefined => {
  if (definition === undefined) return undefined;

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
