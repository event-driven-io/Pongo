import type { DatabaseDriverType } from '@event-driven-io/dumbo';
import {
  type Document,
  type PongoClient,
  type PongoCollection,
  type PongoDb,
  type PongoDocument,
  objectEntries,
} from '../typing';

const DEFAULT_DATABASE_NAME = '__default_database__';
const DEFAULT_DATABASE_SCHEMA_NAME = '__default_database_schema__';

export interface PongoCollectionSchema<
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  T extends PongoDocument = PongoDocument,
> {
  name: string;
  databaseSchema?: string | undefined;
  indexes?: readonly PongoCollectionIndex[] | undefined;
}

export type PongoCollectionIndex = {
  name: string;
  path: string | readonly string[];
  unique?: boolean | undefined;
};

export interface PongoDatabaseSchemaSchema<
  T extends Record<string, PongoCollectionSchema> = Record<
    string,
    PongoCollectionSchema
  >,
  SchemaName extends string = string,
> {
  name: SchemaName;
  collections: T;
}

export type PongoDatabaseSchemas<
  T extends PongoDatabaseSchemaSchema = PongoDatabaseSchemaSchema,
> = Record<string, T>;

// Database schema interface
export interface PongoDbSchema<
  T extends Record<string, PongoCollectionSchema> = Record<
    string,
    PongoCollectionSchema
  >,
  Name extends string | undefined = string | undefined,
> {
  name?: Name;
  collections: T;
  schemas?: PongoDatabaseSchemas | undefined;
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

export type PongoSchemaCollectionsMap<T extends PongoDatabaseSchemas> = {
  [K in keyof T]: CollectionsMap<T[K]['collections']>;
};

export type PongoDbWithSchema<
  T extends PongoDbSchema,
  DriverType extends DatabaseDriverType = DatabaseDriverType,
> = CollectionsMap<T['collections']> &
  (T extends { schemas: infer S extends PongoDatabaseSchemas }
    ? PongoSchemaCollectionsMap<S>
    : object) &
  PongoDb<DriverType>;

export type DBsMap<
  T extends Record<string, PongoDbSchema>,
  DriverType extends DatabaseDriverType = DatabaseDriverType,
  Database extends PongoDb<DriverType> = PongoDb<DriverType>,
> = {
  [K in keyof T]: PongoDbWithSchema<T[K], DriverType> & Database;
};

export type PongoClientWithSchema<
  T extends PongoClientSchema,
  DriverType extends DatabaseDriverType = DatabaseDriverType,
  Database extends PongoDb<DriverType> = PongoDb<DriverType>,
> = DBsMap<T['dbs'], DriverType, Database> & PongoClient<DriverType, Database>;

const pongoCollectionSchema = <T extends PongoDocument>(
  name: string,
  options?: {
    schema?: string;
    databaseSchema?: string;
    indexes?: readonly PongoCollectionIndex[];
  },
): PongoCollectionSchema<T> => ({
  name,
  databaseSchema: options?.databaseSchema ?? options?.schema,
  indexes: options?.indexes,
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

const pongoCollectionIndex = (
  name: string,
  path: string | readonly string[],
  options?: { unique?: boolean | undefined },
): PongoCollectionIndex => ({
  name,
  path,
  unique: options?.unique,
});

pongoCollectionIndex.unique = (
  name: string,
  path: string | readonly string[],
): PongoCollectionIndex => pongoCollectionIndex(name, path, { unique: true });

function pongoDbSchema<T extends Record<string, PongoCollectionSchema>>(
  collections: T,
): PongoDbSchema<T>;
function pongoDbSchema<
  T extends Record<string, PongoCollectionSchema>,
  const Name extends string = string,
>(name: Name, collections: T): PongoDbSchema<T, Name>;
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

function pongoDatabaseSchema<
  const T extends Record<string, PongoCollectionSchema>,
>(
  collections: T,
): PongoDatabaseSchemaSchema<T, typeof DEFAULT_DATABASE_SCHEMA_NAME>;
function pongoDatabaseSchema<
  const T extends Record<string, PongoCollectionSchema>,
  const SchemaName extends string = string,
>(
  schemaName: SchemaName,
  collections: T,
): PongoDatabaseSchemaSchema<T, SchemaName>;
function pongoDatabaseSchema<
  const T extends Record<string, PongoCollectionSchema>,
  const SchemaName extends string = string,
>(
  schemaNameOrCollections: SchemaName | T,
  collections?: T,
): PongoDatabaseSchemaSchema<T, SchemaName> {
  const schemaName =
    typeof schemaNameOrCollections === 'string'
      ? schemaNameOrCollections
      : (DEFAULT_DATABASE_SCHEMA_NAME as SchemaName);
  const schemaCollections =
    typeof schemaNameOrCollections === 'string'
      ? (collections ?? ({} as T))
      : schemaNameOrCollections;

  return {
    name: schemaName,
    collections: objectEntries(schemaCollections).reduce((acc, entry) => {
      const [key, collection] = entry;
      acc[key] = {
        ...collection,
        databaseSchema: collection.databaseSchema ?? schemaName,
      };
      return acc;
    }, {} as T),
  };
}

pongoDatabaseSchema.defaultName = DEFAULT_DATABASE_SCHEMA_NAME;

type UnionToIntersection<T> = (
  T extends unknown ? (value: T) => void : never
) extends (value: infer Intersection) => void
  ? Intersection
  : never;

type DatabaseSchemaCollections<T extends PongoDatabaseSchemas> =
  T[keyof T] extends PongoDatabaseSchemaSchema<infer Collections>
    ? Collections
    : never;

type CollectionsFromDatabaseSchemas<T extends PongoDatabaseSchemas> =
  UnionToIntersection<
    DatabaseSchemaCollections<T>
  > extends infer Collections extends Record<string, PongoCollectionSchema>
    ? Collections
    : never;

function pongoDatabaseSchemaDefinition<
  const Schemas extends PongoDatabaseSchemas,
>(
  schemas: Schemas,
): PongoDbSchema<
  CollectionsFromDatabaseSchemas<Schemas>,
  typeof DEFAULT_DATABASE_NAME
> & {
  name: typeof DEFAULT_DATABASE_NAME;
  schemas: Schemas;
};
function pongoDatabaseSchemaDefinition<
  const Schemas extends PongoDatabaseSchemas,
  const Name extends string = string,
>(
  name: Name,
  schemas: Schemas,
): PongoDbSchema<CollectionsFromDatabaseSchemas<Schemas>, Name> & {
  name: Name;
  schemas: Schemas;
};
function pongoDatabaseSchemaDefinition<
  const Schemas extends PongoDatabaseSchemas,
  const Name extends string = string,
>(
  nameOrSchemas: Name | Schemas,
  schemas?: Schemas,
):
  | (PongoDbSchema<
      CollectionsFromDatabaseSchemas<Schemas>,
      typeof DEFAULT_DATABASE_NAME
    > & {
      name: typeof DEFAULT_DATABASE_NAME;
      schemas: Schemas;
    })
  | (PongoDbSchema<CollectionsFromDatabaseSchemas<Schemas>, Name> & {
      name: Name;
      schemas: Schemas;
    }) {
  const databaseName =
    typeof nameOrSchemas === 'string' ? nameOrSchemas : DEFAULT_DATABASE_NAME;
  const databaseSchemas =
    typeof nameOrSchemas === 'string'
      ? (schemas ?? ({} as Schemas))
      : nameOrSchemas;
  const collections = objectEntries(databaseSchemas).reduce(
    (acc, entry) => {
      const [_schemaKey, schema] = entry;

      for (const [collectionKey, collection] of objectEntries(
        schema.collections,
      )) {
        acc[collectionKey] = collection;
      }

      return acc;
    },
    {} as Record<string, PongoCollectionSchema>,
  ) as CollectionsFromDatabaseSchemas<Schemas>;

  return {
    name: databaseName,
    collections,
    schemas: databaseSchemas,
  } as
    | (PongoDbSchema<
        CollectionsFromDatabaseSchemas<Schemas>,
        typeof DEFAULT_DATABASE_NAME
      > & {
        name: typeof DEFAULT_DATABASE_NAME;
        schemas: Schemas;
      })
    | (PongoDbSchema<CollectionsFromDatabaseSchemas<Schemas>, Name> & {
        name: Name;
        schemas: Schemas;
      });
}

pongoDatabaseSchemaDefinition.defaultName = DEFAULT_DATABASE_NAME;

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
  database: pongoDatabaseSchemaDefinition,
  schema: pongoDatabaseSchema,
  collection: pongoCollectionSchema,
  index: pongoCollectionIndex,
};

// Factory function to create DB instances
export const proxyPongoDbWithSchema = <
  TypedDbSchema extends PongoDbSchema,
  DriverType extends DatabaseDriverType = DatabaseDriverType,
  Database extends PongoDb<DriverType> = PongoDb<DriverType>,
>(
  pongoDb: Database,
  dbSchema: TypedDbSchema,
  collections: Map<string, PongoCollection<Document>>,
): PongoDbWithSchema<TypedDbSchema, DriverType> & Database => {
  const collectionNames = Object.keys(dbSchema.collections);

  for (const collectionName of collectionNames) {
    const collectionSchema = dbSchema.collections[collectionName];

    if (collectionSchema === undefined) continue;

    const collectionOptions =
      collectionSchema.databaseSchema === undefined
        ? undefined
        : { schema: collectionSchema.databaseSchema };

    collections.set(
      collectionName,
      pongoDb.collection(collectionSchema.name, collectionOptions),
    );
  }

  const schemaGroups = new Map<
    string,
    CollectionsMap<Record<string, PongoCollectionSchema>>
  >();

  for (const [schemaKey, databaseSchema] of objectEntries(
    dbSchema.schemas ?? {},
  )) {
    schemaGroups.set(
      schemaKey,
      new Proxy(
        {},
        {
          get(_target, prop: string) {
            const collectionSchema = databaseSchema.collections[prop];

            if (!collectionSchema) return undefined;

            const collectionOptions =
              collectionSchema.databaseSchema === undefined
                ? undefined
                : { schema: collectionSchema.databaseSchema };

            return pongoDb.collection(collectionSchema.name, collectionOptions);
          },
        },
      ),
    );
  }

  return new Proxy(
    pongoDb as Database & {
      [key: string]: unknown;
    },
    {
      get(target, prop: string) {
        return schemaGroups.get(prop) ?? collections.get(prop) ?? target[prop];
      },
    },
  ) as PongoDbWithSchema<TypedDbSchema, DriverType> & Database;
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
