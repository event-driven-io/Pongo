import {
  type ConnectorType,
  type SchemaComponent,
  schemaComponent,
} from '@event-driven-io/dumbo';
import {
  PongoCollectionSchemaComponent,
  type PongoCollectionSQLBuilder,
} from '../collection';

export type PongoDatabaseSchemaComponent<
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  Connector extends ConnectorType = ConnectorType,
> = SchemaComponent<'pongo:schema-component:database'> & {
  collections: ReadonlyArray<PongoCollectionSchemaComponent>;

  collection: (collectionName: string) => PongoCollectionSchemaComponent;
};

export type PongoDatabaseSchemaComponentFactory = <
  Connector extends ConnectorType = ConnectorType,
>(
  connector: Connector,
  existingCollections: PongoCollectionSchemaComponent[],
) => PongoDatabaseSchemaComponent;

export type PongoDatabaseSchemaComponentOptions<
  Connector extends ConnectorType = ConnectorType,
> = Readonly<{
  connector: Connector;
  collectionFactory: (collectionName: string) => PongoCollectionSchemaComponent;
  existingCollections?: PongoCollectionSchemaComponent[] | undefined;
}>;

export const PongoDatabaseSchemaComponent = <
  Connector extends ConnectorType = ConnectorType,
>({
  existingCollections,
  collectionFactory,
}: PongoDatabaseSchemaComponentOptions<Connector>): PongoDatabaseSchemaComponent => {
  const collections = [...(existingCollections ?? [])];

  return {
    ...schemaComponent('pongo:schema-component:database', {
      components: collections,
    }),
    collections,

    collection: (collectionName: string) => {
      const existing = collections.find(
        (c) => c.collectionName === collectionName,
      );

      if (existing) return existing;

      const newCollection = collectionFactory(collectionName);
      collections.push(newCollection);
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
