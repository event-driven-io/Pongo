import type { SQL } from '@event-driven-io/dumbo';
import {
  DEFAULT_DATABASE_SCHEMA_NAME,
  bindTableToDatabaseSchema,
  indexSchemaComponent,
  isSchemaComponentOfType,
  tableSchemaComponent,
  type DatabaseDriverType,
  type IndexSQLContext,
  type TableSchemaComponent,
  type IndexSchemaComponent,
} from '@event-driven-io/dumbo';
import {
  type Document,
  type PongoClient,
  type PongoCollection,
  type PongoDb,
  type PongoDocument,
  objectEntries,
} from '../typing';

const DEFAULT_DATABASE_NAME = '__default_database__';

type PongoCollectionTableColumns = Record<never, never>;
type PongoCollectionTableRelationships = Record<never, never>;
export type PongoCollectionTableKind = 'pongo_collection';
export const PongoCollectionTableKind: PongoCollectionTableKind =
  'pongo_collection';

export type PongoCollectionIndexes<
  Indexes extends readonly PongoCollectionIndexDefinition[] =
    readonly PongoCollectionIndexDefinition[],
> = string extends Indexes[number]['name']
  ? Record<never, never>
  : {
      [Index in Indexes[number] as Index['name']]: PongoCollectionIndex;
    };

export type PongoCollectionSchema<
  T extends PongoDocument = PongoDocument,
  TableName extends string = string,
  DatabaseSchemaName extends string = string,
  Indexes extends readonly PongoCollectionIndexDefinition[] =
    readonly PongoCollectionIndexDefinition[],
> = TableSchemaComponent<
  PongoCollectionTableColumns,
  TableName,
  DatabaseSchemaName,
  PongoCollectionTableRelationships,
  PongoCollectionIndexes<Indexes>,
  PongoCollectionTableKind,
  { document: T }
>;

// Allows driver packages and users to type custom index options via declaration merging.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface PongoCollectionIndexExtensions {}

export type PongoCollectionIndexType =
  'json_path' | 'json_document' | (string & {});

export type PongoCollectionIndexDefinition<
  Type extends PongoCollectionIndexType = PongoCollectionIndexType,
> = {
  name: string;
  path?: string | readonly string[] | undefined;
  unique?: boolean | undefined;
  type?: Type | undefined;
  sql?: ((context: PongoCollectionIndexSQLContext) => SQL) | undefined;
  options?: Type extends keyof PongoCollectionIndexExtensions
    ? PongoCollectionIndexExtensions[Type]
    : Record<string, unknown> | undefined;
};

export type PongoCollectionIndex<
  Type extends PongoCollectionIndexType = PongoCollectionIndexType,
> = IndexSchemaComponent<Type, string, Record<string, unknown>> &
  PongoCollectionIndexDefinition<Type>;

export type PongoCollectionIndexSQLContext = IndexSQLContext;

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

function pongoCollectionSchema<
  T extends PongoDocument,
  const TableName extends string = string,
>(
  name: TableName,
): PongoCollectionSchema<T, TableName, typeof DEFAULT_DATABASE_SCHEMA_NAME, []>;
function pongoCollectionSchema<
  T extends PongoDocument,
  const TableName extends string = string,
  const Indexes extends readonly PongoCollectionIndexDefinition[] =
    readonly PongoCollectionIndexDefinition[],
>(
  name: TableName,
  options: {
    schema?: string;
    databaseSchema?: string;
    indexes?: Indexes;
  },
): PongoCollectionSchema<T, TableName, string, Indexes>;
function pongoCollectionSchema<
  T extends PongoDocument,
  const TableName extends string = string,
  const Indexes extends readonly PongoCollectionIndexDefinition[] =
    readonly PongoCollectionIndexDefinition[],
>(
  name: TableName,
  options?: {
    schema?: string;
    databaseSchema?: string;
    indexes?: Indexes;
  },
):
  | PongoCollectionSchema<T, TableName, typeof DEFAULT_DATABASE_SCHEMA_NAME, []>
  | PongoCollectionSchema<T, TableName, string, Indexes> {
  const indexes = (options?.indexes ?? []) as unknown as Indexes;
  const indexesMap = Object.fromEntries(
    indexes.map((index) => {
      const indexComponent =
        'schemaComponentKey' in index &&
        typeof index.schemaComponentKey === 'string' &&
        isSchemaComponentOfType(index as PongoCollectionIndex, 'sc:dumbo:index')
          ? index
          : {
              ...indexSchemaComponent({
                indexName: index.name,
                indexKind: index.type ?? 'json_path',
                columnNames: ['data'],
                isUnique: index.unique ?? false,
                sql: index.sql,
                additionalData: {
                  name: index.name,
                  ...(index.path !== undefined ? { path: index.path } : {}),
                  ...(index.unique !== undefined
                    ? { unique: index.unique }
                    : {}),
                  ...(index.type !== undefined ? { type: index.type } : {}),
                  ...(index.options !== undefined
                    ? { options: index.options }
                    : {}),
                },
              }),
              name: index.name,
              ...(index.path !== undefined ? { path: index.path } : {}),
              ...(index.unique !== undefined ? { unique: index.unique } : {}),
              ...(index.type !== undefined ? { type: index.type } : {}),
              ...(index.sql !== undefined ? { sql: index.sql } : {}),
              ...(index.options !== undefined
                ? { options: index.options }
                : {}),
            };

      return [index.name, indexComponent];
    }),
  ) as PongoCollectionIndexes<Indexes>;

  return tableSchemaComponent({
    tableName: name,
    databaseSchemaName:
      options?.databaseSchema ??
      options?.schema ??
      DEFAULT_DATABASE_SCHEMA_NAME,
    tableKind: PongoCollectionTableKind,
    columns: {},
    relationships: {},
    primaryKey: [],
    indexes: indexesMap,
    additionalData: {
      document: undefined as unknown as T,
    },
  });
}

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
): PongoCollectionIndex => {
  const index = indexSchemaComponent({
    indexName: name,
    indexKind: 'json_path',
    columnNames: ['data'],
    isUnique: options?.unique ?? false,
    additionalData: {
      name,
      path,
      unique: options?.unique,
      type: 'json_path' as const,
    },
  });

  return {
    ...index,
    name,
    path,
    unique: options?.unique,
    type: 'json_path',
  };
};

pongoCollectionIndex.unique = (
  name: string,
  path: string | readonly string[],
): PongoCollectionIndex => pongoCollectionIndex(name, path, { unique: true });

pongoCollectionIndex.json = (name: string): PongoCollectionIndex => {
  const index = indexSchemaComponent({
    indexName: name,
    indexKind: 'json_document',
    columnNames: ['data'],
    isUnique: false,
    additionalData: {
      name,
      type: 'json_document' as const,
    },
  });

  return {
    ...index,
    name,
    type: 'json_document',
  };
};

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
      acc[key] = bindTableToDatabaseSchema(
        collection,
        schemaName,
      ) as unknown as T[typeof key];
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
      collectionSchema.databaseSchemaName === DEFAULT_DATABASE_SCHEMA_NAME
        ? undefined
        : { schema: collectionSchema.databaseSchemaName };

    collections.set(
      collectionName,
      pongoDb.collection(collectionSchema.tableName, collectionOptions),
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
              collectionSchema.databaseSchemaName ===
              DEFAULT_DATABASE_SCHEMA_NAME
                ? undefined
                : { schema: collectionSchema.databaseSchemaName };

            return pongoDb.collection(
              collectionSchema.tableName,
              collectionOptions,
            );
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
    name: c[1].tableName,
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
