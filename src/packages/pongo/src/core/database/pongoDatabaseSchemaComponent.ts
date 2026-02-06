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

export type PongoDatabaseURNType = 'sc:dumbo:database';
export type PongoDatabaseURN = `${PongoDatabaseURNType}:${string}`;

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

  return {
    ...schemaComponent(`sc:dumbo:database:${definition.name}`, {
      components: collections,
    }),
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
