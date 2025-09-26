import type { DatabaseDriverType } from '@event-driven-io/dumbo';
import {
  type Document,
  type PongoClient,
  type PongoCollection,
  type PongoDb,
  type PongoDocument,
  objectEntries,
} from '../typing';

export interface PongoCollectionSchema<
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  T extends PongoDocument = PongoDocument,
> {
  name: string;
}

// Database schema interface
export interface PongoDbSchema<
  T extends Record<string, PongoCollectionSchema> = Record<
    string,
    PongoCollectionSchema
  >,
> {
  name?: string;
  collections: T;
}

export interface PongoClientSchema<
  T extends Record<string, PongoDbSchema> = Record<string, PongoDbSchema>,
> {
  dbs: T;
}

export type CollectionsMap<T extends Record<string, PongoCollectionSchema>> = {
  [K in keyof T]: PongoCollection<
    T[K] extends PongoCollectionSchema<infer U> ? U : PongoDocument
  >;
};

export type PongoDbWithSchema<
  T extends Record<string, PongoCollectionSchema>,
  DriverType extends DatabaseDriverType = DatabaseDriverType,
> = CollectionsMap<T> & PongoDb<DriverType>;

export type DBsMap<
  T extends Record<string, PongoDbSchema>,
  DriverType extends DatabaseDriverType = DatabaseDriverType,
  Database extends PongoDb<DriverType> = PongoDb<DriverType>,
> = {
  [K in keyof T]: CollectionsMap<T[K]['collections']> & Database;
};

export type PongoClientWithSchema<
  T extends PongoClientSchema,
  DriverType extends DatabaseDriverType = DatabaseDriverType,
  Database extends PongoDb<DriverType> = PongoDb<DriverType>,
> = DBsMap<T['dbs'], DriverType, Database> & PongoClient<DriverType, Database>;

const pongoCollectionSchema = <T extends PongoDocument>(
  name: string,
): PongoCollectionSchema<T> => ({
  name,
});

pongoCollectionSchema.from = (
  collectionNames: string[],
): Record<string, PongoCollectionSchema> =>
  collectionNames.reduce(
    (acc, collectionName) => (
      (acc[collectionName] = pongoSchema.collection(collectionName)),
      acc
    ),
    {} as Record<string, PongoCollectionSchema>,
  );

function pongoDbSchema<T extends Record<string, PongoCollectionSchema>>(
  collections: T,
): PongoDbSchema<T>;
function pongoDbSchema<T extends Record<string, PongoCollectionSchema>>(
  name: string,
  collections: T,
): PongoDbSchema<T>;
function pongoDbSchema<T extends Record<string, PongoCollectionSchema>>(
  nameOrCollections: string | T,
  collections?: T,
): PongoDbSchema<T> {
  if (collections === undefined) {
    if (typeof nameOrCollections === 'string') {
      throw new Error('You need to provide colleciton definition');
    }
    return {
      collections: nameOrCollections,
    };
  }

  return nameOrCollections && typeof nameOrCollections === 'string'
    ? {
        name: nameOrCollections,
        collections,
      }
    : { collections: collections };
}

pongoDbSchema.from = (
  databaseName: string | undefined,
  collectionNames: string[],
): PongoDbSchema =>
  databaseName
    ? pongoDbSchema(databaseName, pongoCollectionSchema.from(collectionNames))
    : pongoDbSchema(pongoCollectionSchema.from(collectionNames));

const pongoClientSchema = <T extends Record<string, PongoDbSchema>>(
  dbs: T,
): PongoClientSchema<T> => ({
  dbs,
});

export const pongoSchema = {
  client: pongoClientSchema,
  db: pongoDbSchema,
  collection: pongoCollectionSchema,
};

// Factory function to create DB instances
export const proxyPongoDbWithSchema = <
  Collections extends Record<string, PongoCollectionSchema>,
  DriverType extends DatabaseDriverType = DatabaseDriverType,
  Database extends PongoDb<DriverType> = PongoDb<DriverType>,
>(
  pongoDb: Database,
  dbSchema: PongoDbSchema<Collections>,
  collections: Map<string, PongoCollection<Document>>,
): PongoDbWithSchema<Collections, DriverType> & Database => {
  const collectionNames = Object.keys(dbSchema.collections);

  for (const collectionName of collectionNames) {
    collections.set(collectionName, pongoDb.collection(collectionName));
  }

  return new Proxy(
    pongoDb as Database & {
      [key: string]: unknown;
    },
    {
      get(target, prop: string) {
        return collections.get(prop) ?? target[prop];
      },
    },
  ) as PongoDbWithSchema<Collections, DriverType> & Database;
};

export const proxyClientWithSchema = <
  TypedClientSchema extends PongoClientSchema,
  DriverType extends DatabaseDriverType = DatabaseDriverType,
  Database extends PongoDb<DriverType> = PongoDb<DriverType>,
>(
  client: PongoClient<DriverType, Database>,
  schema: TypedClientSchema | undefined,
): PongoClientWithSchema<TypedClientSchema, DriverType, Database> => {
  if (!schema)
    return client as PongoClientWithSchema<
      TypedClientSchema,
      DriverType,
      Database
    >;

  const dbNames = Object.keys(schema.dbs);

  return new Proxy(
    client as PongoClient<DriverType, Database> & {
      [key: string]: unknown;
    },
    {
      get(target, prop: string) {
        if (dbNames.includes(prop)) return client.db(schema.dbs[prop]?.name);

        return target[prop];
      },
    },
  ) as PongoClientWithSchema<TypedClientSchema, DriverType, Database>;
};

export type PongoCollectionSchemaMetadata = {
  name: string;
};

export type PongoDbSchemaMetadata = {
  name?: string | undefined;
  collections: PongoCollectionSchemaMetadata[];
};

export type PongoClientSchemaMetadata = {
  databases: PongoDbSchemaMetadata[];
  database: (name?: string) => PongoDbSchemaMetadata | undefined;
};

export const toDbSchemaMetadata = <TypedDbSchema extends PongoDbSchema>(
  schema: TypedDbSchema,
): PongoDbSchemaMetadata => ({
  name: schema.name,
  collections: objectEntries(schema.collections).map((c) => ({
    name: c[1].name,
  })),
});

export const toClientSchemaMetadata = <
  TypedClientSchema extends PongoClientSchema,
>(
  schema: TypedClientSchema,
): PongoClientSchemaMetadata => {
  const databases = objectEntries(schema.dbs).map((e) =>
    toDbSchemaMetadata(e[1]),
  );

  return {
    databases,
    database: (name) => databases.find((db) => db.name === name),
  };
};

export interface PongoSchemaConfig<
  TypedClientSchema extends PongoClientSchema = PongoClientSchema,
> {
  schema: TypedClientSchema;
}
