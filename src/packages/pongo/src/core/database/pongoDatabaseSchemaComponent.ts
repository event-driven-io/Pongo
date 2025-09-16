import {
  type ConnectorType,
  type SchemaComponent,
  schemaComponent,
} from '@event-driven-io/dumbo/src';
import { PongoCollectionSchemaComponent } from '../../storage/all';
import type {
  PongoCollectionSchemaComponentOptions,
  PongoCollectionSQLBuilder,
} from '../collection';

export type PongoDatabaseSchemaComponent<
  Connector extends ConnectorType = ConnectorType,
> = SchemaComponent<'pongo:schema-component:database'> & {
  collections: ReadonlyArray<PongoCollectionSchemaComponent>;

  addCollection: (
    options: PongoCollectionSchemaComponentOptions,
  ) => PongoCollectionSchemaComponent;
};

export const PongoDatabaseSchemaComponent = <
  Connector extends ConnectorType = ConnectorType,
>(
  _connector: Connector,
  existingCollections: PongoCollectionSchemaComponent[],
): PongoDatabaseSchemaComponent => {
  const collections = [...existingCollections];

  return {
    ...schemaComponent('pongo:schema-component:database', {
      components: collections,
    }),
    collections,

    addCollection: (options: PongoCollectionSchemaComponentOptions) => {
      const existing = collections.find(
        (c) => c.collectionName === options.collectionName,
      );

      if (existing) return existing;

      const newCollection = PongoCollectionSchemaComponent(options);
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
