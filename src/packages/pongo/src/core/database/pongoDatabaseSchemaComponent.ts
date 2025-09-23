import {
  schemaComponent,
  type ConnectorType,
  type SchemaComponent,
} from '@event-driven-io/dumbo';
import {
  PongoCollectionSchemaComponent,
  type PongoCollectionSQLBuilder,
} from '../collection';
import {
  pongoSchema,
  type PongoCollectionSchema,
  type PongoDbSchema,
} from '../schema';
import type { PongoDocument } from '../typing';

export type PongoDatabaseSchemaComponent<
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  Connector extends ConnectorType = ConnectorType,
  T extends Record<string, PongoCollectionSchema> = Record<
    string,
    PongoCollectionSchema
  >,
> = SchemaComponent<'pongo:schema-component:database'> & {
  definition: PongoDbSchema<T>;
  collections: ReadonlyArray<PongoCollectionSchemaComponent>;

  collection: <T extends PongoDocument = PongoDocument>(
    schema: PongoCollectionSchema<T>,
  ) => PongoCollectionSchemaComponent;
};

export type PongoDatabaseSchemaComponentFactory = <
  Connector extends ConnectorType = ConnectorType,
>(
  connector: Connector,
  existingCollections: PongoCollectionSchemaComponent[],
) => PongoDatabaseSchemaComponent;

export type PongoDatabaseSchemaComponentOptions<
  Connector extends ConnectorType = ConnectorType,
  T extends Record<string, PongoCollectionSchema> = Record<
    string,
    PongoCollectionSchema
  >,
> = Readonly<{
  connector: Connector;
  definition: PongoDbSchema<T>;
  collectionFactory: <T extends PongoDocument = PongoDocument>(
    schema: PongoCollectionSchema<T>,
  ) => PongoCollectionSchemaComponent;
}>;

export const PongoDatabaseSchemaComponent = <
  Connector extends ConnectorType = ConnectorType,
>({
  definition,
  collectionFactory,
}: PongoDatabaseSchemaComponentOptions<Connector>): PongoDatabaseSchemaComponent => {
  const collections: PongoCollectionSchemaComponent[] =
    Object.values(definition.collections).map(collectionFactory) ?? [];

  return {
    ...schemaComponent('pongo:schema-component:database', {
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
  Connector extends ConnectorType = ConnectorType,
> = {
  connector: Connector;
  collection: PongoCollectionSQLBuilder;
};
