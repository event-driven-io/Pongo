import {
  databaseComponent,
  type DatabaseComponent,
} from '@event-driven-io/dumbo';
import {
  pongoSchema,
  type PongoCollectionComponent,
  type PongoDatabaseComponent,
  type PongoSchemaComponent,
} from '../schema';

export type ComposePongoDatabaseOptions = Readonly<{
  databaseName: string;
  defaultSchemaName: string;
  definition: PongoDatabaseComponent;
}>;

export const composePongoDatabase = ({
  databaseName,
  defaultSchemaName,
  definition,
}: ComposePongoDatabaseOptions): DatabaseComponent => {
  const collectionsBySchema = new Map<
    string,
    Record<string, PongoCollectionComponent>
  >();
  const extensionsBySchema = new Map<
    string,
    PongoSchemaComponent['extensions']
  >();

  const addCollection = (
    databaseSchemaName: string,
    alias: string,
    collection: PongoCollectionComponent,
  ): void => {
    const collections = collectionsBySchema.get(databaseSchemaName) ?? {};
    collections[alias] = collection;
    collectionsBySchema.set(databaseSchemaName, collections);
  };

  if ('collections' in definition) {
    collectionsBySchema.set(defaultSchemaName, {});
    for (const [alias, collection] of Object.entries(definition.collections)) {
      addCollection(
        collection.databaseSchemaName ?? defaultSchemaName,
        alias,
        collection,
      );
    }
  } else {
    for (const [databaseSchemaName, schema] of Object.entries(
      definition.schemas,
    )) {
      collectionsBySchema.set(databaseSchemaName, {});
      extensionsBySchema.set(databaseSchemaName, schema.extensions);
      for (const [alias, collection] of Object.entries(schema.tables)) {
        addCollection(databaseSchemaName, alias, collection);
      }
    }
  }

  const schemas = Object.fromEntries(
    [...collectionsBySchema].map(([databaseSchemaName, collections]) => [
      databaseSchemaName,
      pongoSchema.schema(
        databaseSchemaName,
        collections,
        extensionsBySchema.get(databaseSchemaName),
      ),
    ]),
  );

  return databaseComponent({
    databaseName,
    schemas,
    extensions: definition.extensions,
  });
};
