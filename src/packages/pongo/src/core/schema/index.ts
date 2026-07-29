import type {
  schemaComponentType,
  tableComponentType,
  columnComponentType,
} from '@event-driven-io/dumbo';
import {
  databaseComponent,
  databaseSchemaComponent,
  dumboSchema,
  indexComponent,
  isDatabaseComponent,
  isDatabaseSchemaComponent,
  jsonDocumentIndexTarget,
  jsonPathIndexTarget,
  isSchemaComponent,
  isTableComponent,
  SQL,
  type SQL as SQLStatement,
  type DatabaseComponent,
  type DatabaseDriverType,
  type DatabaseExtensions,
  type DatabaseSchemaComponent,
  type IndexComponent,
  type IndexSQLContext,
  type SchemaExtensions,
  type TableComponent,
} from '@event-driven-io/dumbo';
import {
  type PongoClient,
  type PongoCollection,
  type PongoDb,
  type PongoDocument,
  objectEntries,
} from '../typing';

export const pongoDatabaseComponentType: unique symbol = Symbol(
  'pongo.databaseComponent',
);
export const pongoSchemaComponentType: unique symbol = Symbol(
  'pongo.schemaComponent',
);
export const pongoCollectionComponentType: unique symbol = Symbol(
  'pongo.collectionComponent',
);
export const pongoDocumentType: unique symbol = Symbol('pongo.documentType');

type EmptyComponentRecord = Readonly<Record<never, never>>;

export type PongoIndexComponent<Name extends string = string> = IndexComponent<
  Name,
  readonly ['data']
>;

export type PongoCollectionIndex = PongoIndexComponent;
export type PongoCollectionIndexSQLContext = IndexSQLContext;
export type PongoCollectionIndexes = Readonly<
  Record<string, PongoIndexComponent>
>;

const { column, table } = dumboSchema;
const { BigInteger, Boolean, JSON, Text, Timestamptz } = SQL.column.type;

const pongoCollectionColumns = <Document extends PongoDocument>() =>
  ({
    _id: column('_id', Text, {
      primaryKey: true,
      notNull: true,
    }),
    data: column('data', JSON<Document>(), {
      notNull: true,
    }),
    metadata: column('metadata', JSON<Record<string, unknown>>(), {
      notNull: true,
      default: SQL.literal('{}'),
    }),
    _version: column('_version', BigInteger, {
      notNull: true,
      default: 1n,
    }),
    _partition: column('_partition', Text, {
      notNull: true,
      default: 'png_global',
    }),
    _archived: column('_archived', Boolean, {
      notNull: true,
      default: false,
    }),
    _created: column('_created', Timestamptz, {
      notNull: true,
      default: SQL.plain('CURRENT_TIMESTAMP'),
    }),
    _updated: column('_updated', Timestamptz, {
      notNull: true,
      default: SQL.plain('CURRENT_TIMESTAMP'),
    }),
  }) satisfies Record<
    string,
    { [schemaComponentType]: typeof columnComponentType }
  >;

export type PongoCollectionColumns<Document extends PongoDocument> = ReturnType<
  typeof pongoCollectionColumns<Document>
>;

const pongoCollectionTable = <
  Document extends PongoDocument,
  const Name extends string,
  const Indexes extends PongoCollectionIndexes,
>(
  name: Name,
  options: Readonly<{
    databaseSchemaName?: string;
    indexes?: Indexes;
  }>,
): TableComponent<PongoCollectionColumns<Document>, Name, Indexes> =>
  table(name, {
    columns: pongoCollectionColumns<Document>(),
    ...options,
    primaryKey: ['_id'],
  });

export type PongoCollectionComponent<
  Document extends PongoDocument = PongoDocument,
  Name extends string = string,
  Indexes extends PongoCollectionIndexes = PongoCollectionIndexes,
> = TableComponent<PongoCollectionColumns<Document>, Name, Indexes> &
  Readonly<{
    [schemaComponentType]: typeof tableComponentType;
    [pongoCollectionComponentType]: true;
    [pongoDocumentType]: Document;
  }>;

export type PongoSchemaComponent<
  Collections extends Readonly<Record<string, PongoCollectionComponent>> =
    Readonly<Record<string, PongoCollectionComponent>>,
  Name extends string | undefined = string | undefined,
  Extensions extends SchemaExtensions = SchemaExtensions,
> = DatabaseSchemaComponent<Collections, Name, Extensions> &
  Readonly<{ [pongoSchemaComponentType]: true }>;

export type PongoDatabaseSchemas = Readonly<
  Record<string, PongoSchemaComponent>
>;

export type PongoDbCollectionsDefinition<
  Collections extends Readonly<Record<string, PongoCollectionComponent>> =
    Readonly<Record<string, PongoCollectionComponent>>,
> = Readonly<{
  collections: Collections;
  schemas?: never;
}>;

export type PongoDbSchemasDefinition<
  Schemas extends PongoDatabaseSchemas = PongoDatabaseSchemas,
> = Readonly<{
  collections?: never;
  schemas: Schemas;
}>;

export type PongoDatabaseDefinition =
  PongoDbCollectionsDefinition | PongoDbSchemasDefinition;

type PongoDatabaseShape<
  Definition extends PongoDatabaseDefinition,
  Name extends string | undefined,
  Extensions extends DatabaseExtensions,
> =
  Definition extends PongoDbCollectionsDefinition<infer Collections>
    ? DatabaseComponent<EmptyComponentRecord, Name, Extensions> &
        Readonly<{
          collections: Collections;
        }>
    : Definition extends PongoDbSchemasDefinition<infer Schemas>
      ? DatabaseComponent<Schemas, Name, Extensions>
      : never;

export type PongoDatabaseComponent<
  Definition extends PongoDatabaseDefinition = PongoDatabaseDefinition,
  Name extends string | undefined = string | undefined,
  Extensions extends DatabaseExtensions = DatabaseExtensions,
> = PongoDatabaseShape<Definition, Name, Extensions> &
  Readonly<{ [pongoDatabaseComponentType]: true }>;

export type PongoDbSchema<
  Definition extends PongoDatabaseDefinition = PongoDatabaseDefinition,
  Name extends string | undefined = string | undefined,
> = PongoDatabaseComponent<Definition, Name>;

export interface PongoClientSchema<
  Databases extends Readonly<Record<string, PongoDatabaseComponent>> = Readonly<
    Record<string, PongoDatabaseComponent>
  >,
> {
  dbs: Databases;
}

type PongoDatabaseSchemaKey<T extends PongoDatabaseComponent> =
  T['databaseName'] extends string ? T['databaseName'] : string;

export type PongoClientSchemaFromDefinition<T> = T extends PongoClientSchema
  ? T
  : T extends PongoDatabaseComponent
    ? PongoClientSchema<{ [Key in PongoDatabaseSchemaKey<T>]: T }>
    : PongoClientSchema;

type DocumentOf<Collection extends PongoCollectionComponent> =
  Collection extends PongoCollectionComponent<infer Document>
    ? Document
    : PongoDocument;

export type CollectionsMap<
  Collections extends Readonly<Record<string, PongoCollectionComponent>>,
> = {
  [Key in Exclude<keyof Collections, keyof PongoDb>]: PongoCollection<
    DocumentOf<Collections[Key]>
  >;
};

export type PongoSchemaCollectionsMap<Schemas extends PongoDatabaseSchemas> = {
  [
    Key in Exclude<keyof Schemas, keyof PongoDb>
  ]: Schemas[Key] extends PongoSchemaComponent<infer Collections>
    ? CollectionsMap<Collections>
    : never;
};

export type PongoDbWithSchema<
  Definition extends PongoDatabaseComponent,
  DriverType extends DatabaseDriverType = DatabaseDriverType,
> = (Definition extends {
  collections: infer Collections extends Readonly<
    Record<string, PongoCollectionComponent>
  >;
}
  ? CollectionsMap<Collections>
  : Definition extends {
        schemas: infer Schemas;
      }
    ? PongoSchemaCollectionsMap<
        Schemas extends PongoDatabaseSchemas ? Schemas : PongoDatabaseSchemas
      >
    : object) &
  PongoDb<DriverType>;

export type DBsMap<
  Databases extends Readonly<Record<string, PongoDatabaseComponent>>,
  DriverType extends DatabaseDriverType = DatabaseDriverType,
  Database extends PongoDb<DriverType> = PongoDb<DriverType>,
> = {
  [Key in keyof Databases]: PongoDbWithSchema<Databases[Key], DriverType> &
    Database;
};

export type PongoClientWithSchema<
  Schema extends PongoClientSchema,
  DriverType extends DatabaseDriverType = DatabaseDriverType,
  Database extends PongoDb<DriverType> = PongoDb<DriverType>,
> = DBsMap<Schema['dbs'], DriverType, Database> &
  PongoClient<DriverType, Database>;

const defineValue = (
  target: object,
  key: PropertyKey,
  value: unknown,
): void => {
  Object.defineProperty(target, key, {
    value,
    enumerable: typeof key === 'string',
    configurable: false,
    writable: false,
  });
};

const pongoIndex = <
  const Name extends string,
  const Path extends string | readonly string[],
>(
  name: Name,
  path: Path,
  unique = false,
): PongoIndexComponent<Name> => {
  const index = indexComponent({
    indexName: name,
    indexTargetNames: typeof path === 'string' ? [path] : path,
    columnNames: ['data'] as const,
    isUnique: unique,
    target: jsonPathIndexTarget('data', path),
  });
  return index;
};

const pongoUniqueIndex = <
  const Name extends string,
  const Path extends string | readonly string[],
>(
  name: Name,
  path: Path,
): PongoIndexComponent<Name> => pongoIndex(name, path, true);

const pongoDocumentIndex = <const Name extends string>(
  name: Name,
): PongoIndexComponent<Name> => {
  const index = indexComponent({
    indexName: name,
    indexTargetNames: ['data'],
    columnNames: ['data'] as const,
    isUnique: false,
    target: jsonDocumentIndexTarget('data'),
  });
  return index;
};

const pongoCustomSQLIndex = <const Name extends string>(
  name: Name,
  sql: (context: PongoCollectionIndexSQLContext) => SQLStatement,
): PongoIndexComponent<Name> => {
  const index = indexComponent({
    indexName: name,
    indexTargetNames: ['data'],
    columnNames: ['data'] as const,
    isUnique: false,
    sql,
  });
  return index;
};

const pongoCollection = <
  Document extends PongoDocument,
  const Name extends string = string,
  const Indexes extends PongoCollectionIndexes = EmptyComponentRecord,
>(
  name: Name,
  options: Readonly<{
    databaseSchemaName?: string;
    indexes?: Indexes;
  }> = {},
): PongoCollectionComponent<Document, Name, Indexes> => {
  const collection = pongoCollectionTable<Document, Name, Indexes>(
    name,
    options,
  );
  defineValue(collection, pongoCollectionComponentType, true);
  return collection as PongoCollectionComponent<Document, Name, Indexes>;
};

pongoCollection.from = (
  collectionNames: string[],
): Record<string, PongoCollectionComponent> =>
  Object.fromEntries(
    collectionNames.map((name) => [name, pongoCollection(name)]),
  );

function pongoDatabaseSchema<
  const Collections extends Readonly<Record<string, PongoCollectionComponent>>,
  const Extensions extends SchemaExtensions = EmptyComponentRecord,
>(
  collections: Collections,
  extensions?: Extensions,
): PongoSchemaComponent<Collections, undefined, Extensions>;
function pongoDatabaseSchema<
  const Collections extends Readonly<Record<string, PongoCollectionComponent>>,
  const Name extends string,
  const Extensions extends SchemaExtensions = EmptyComponentRecord,
>(
  name: Name,
  collections: Collections,
  extensions?: Extensions,
): PongoSchemaComponent<Collections, Name, Extensions>;
function pongoDatabaseSchema(
  nameOrCollections:
    string | Readonly<Record<string, PongoCollectionComponent>>,
  collectionsOrExtensions?:
    Readonly<Record<string, PongoCollectionComponent>> | SchemaExtensions,
  extensions?: SchemaExtensions,
): PongoSchemaComponent {
  const schema =
    typeof nameOrCollections === 'string'
      ? databaseSchemaComponent({
          schemaName: nameOrCollections,
          tables:
            (collectionsOrExtensions as Readonly<
              Record<string, PongoCollectionComponent>
            >) ?? {},
          extensions,
        })
      : databaseSchemaComponent({
          tables: nameOrCollections,
          extensions: collectionsOrExtensions as SchemaExtensions | undefined,
        });
  defineValue(schema, pongoSchemaComponentType, true);
  return schema as PongoSchemaComponent;
}

function pongoDatabase<
  const Definition extends PongoDatabaseDefinition,
  const Extensions extends DatabaseExtensions = EmptyComponentRecord,
>(
  definition: Definition,
  extensions?: Extensions,
): PongoDatabaseComponent<Definition, undefined, Extensions>;
function pongoDatabase<
  const Definition extends PongoDatabaseDefinition,
  const Name extends string,
  const Extensions extends DatabaseExtensions = EmptyComponentRecord,
>(
  name: Name,
  definition: Definition,
  extensions?: Extensions,
): PongoDatabaseComponent<Definition, Name, Extensions>;
function pongoDatabase(
  nameOrDefinition: string | PongoDatabaseDefinition,
  definitionOrExtensions?: PongoDatabaseDefinition | DatabaseExtensions,
  extensions?: DatabaseExtensions,
): PongoDatabaseComponent {
  const databaseName =
    typeof nameOrDefinition === 'string' ? nameOrDefinition : undefined;
  const definition =
    typeof nameOrDefinition === 'string'
      ? (definitionOrExtensions as PongoDatabaseDefinition | undefined)
      : nameOrDefinition;
  const databaseExtensions =
    typeof nameOrDefinition === 'string'
      ? extensions
      : (definitionOrExtensions as DatabaseExtensions | undefined);

  if (definition === undefined) {
    throw new Error('You need to provide a database declaration');
  }

  const hasCollections =
    'collections' in definition && definition.collections !== undefined;
  const hasSchemas =
    'schemas' in definition && definition.schemas !== undefined;
  if (hasCollections === hasSchemas) {
    throw new Error(
      'A Pongo database declaration must contain exactly one of collections or schemas',
    );
  }

  if (hasCollections) {
    const collections = Object.freeze({ ...definition.collections });
    const database = databaseComponent({
      databaseName,
      schemas: {},
      extensions: databaseExtensions,
    });
    defineValue(database, pongoDatabaseComponentType, true);
    defineValue(database, 'collections', collections);
    return database as PongoDatabaseComponent;
  }

  const database = databaseComponent({
    databaseName,
    schemas: definition.schemas,
    extensions: databaseExtensions,
  });
  defineValue(database, pongoDatabaseComponentType, true);
  return database as PongoDatabaseComponent;
}

pongoDatabase.from = (
  databaseName: string | undefined,
  collectionNames: string[],
): PongoDatabaseComponent =>
  databaseName === undefined
    ? pongoDatabase({
        collections: pongoCollection.from(collectionNames),
      })
    : pongoDatabase(databaseName, {
        collections: pongoCollection.from(collectionNames),
      });

const pongoClientSchema = <
  const Databases extends Readonly<Record<string, PongoDatabaseComponent>>,
>(
  dbs: Databases,
): PongoClientSchema<Databases> => ({ dbs });

const pongoIndexFactory = Object.assign(
  <const Name extends string, const Path extends string | readonly string[]>(
    name: Name,
    path: Path,
  ) => pongoIndex(name, path),
  {
    unique: pongoUniqueIndex,
    json: pongoDocumentIndex,
    custom: pongoCustomSQLIndex,
  },
);

export const pongoSchema = {
  client: pongoClientSchema,
  db: pongoDatabase,
  schema: pongoDatabaseSchema,
  collection: pongoCollection,
  index: pongoIndexFactory,
};

export const isPongoCollectionComponent = (
  value: unknown,
): value is PongoCollectionComponent =>
  isSchemaComponent(value) &&
  isTableComponent(value) &&
  pongoCollectionComponentType in value &&
  value[pongoCollectionComponentType] === true;

export const isPongoSchemaComponent = (
  value: unknown,
): value is PongoSchemaComponent =>
  isSchemaComponent(value) &&
  isDatabaseSchemaComponent(value) &&
  pongoSchemaComponentType in value &&
  value[pongoSchemaComponentType] === true;

export const isPongoDatabaseComponent = (
  value: unknown,
): value is PongoDatabaseComponent =>
  isSchemaComponent(value) &&
  isDatabaseComponent(value) &&
  pongoDatabaseComponentType in value &&
  value[pongoDatabaseComponentType] === true;

export const projectPongoDb = <
  Definition extends PongoDatabaseComponent,
  DriverType extends DatabaseDriverType = DatabaseDriverType,
  Database extends PongoDb<DriverType> = PongoDb<DriverType>,
>(
  pongoDb: Database,
  definition: Definition,
): PongoDbWithSchema<Definition, DriverType> & Database => {
  const assertAvailable = (
    target: object,
    name: string,
    definitionKind: 'collection' | 'schema',
  ): void => {
    if (name in target) {
      throw new Error(
        `Pongo ${definitionKind} name ${name} conflicts with a database API member`,
      );
    }
  };

  if ('collections' in definition) {
    for (const [alias, collection] of objectEntries(definition.collections)) {
      assertAvailable(pongoDb, alias, 'collection');
      Object.defineProperty(pongoDb, alias, {
        enumerable: true,
        configurable: false,
        get: () =>
          pongoDb.collection(collection.tableName, {
            databaseSchemaName: collection.databaseSchemaName,
          }),
      });
    }
  } else {
    for (const [schemaName, schema] of objectEntries(definition.schemas)) {
      assertAvailable(pongoDb, schemaName, 'schema');
      const scope = Object.create(null) as Record<string, unknown>;

      for (const [alias, collection] of objectEntries(schema.tables)) {
        if (alias in scope) {
          throw new Error(
            `Pongo collection name ${alias} conflicts with a schema scope member`,
          );
        }
        Object.defineProperty(scope, alias, {
          enumerable: true,
          configurable: false,
          get: () =>
            pongoDb.collection(collection.tableName, {
              databaseSchemaName: schemaName,
            }),
        });
      }

      Object.defineProperty(pongoDb, schemaName, {
        enumerable: true,
        configurable: false,
        get: () => scope,
      });
    }
  }

  return pongoDb as PongoDbWithSchema<Definition, DriverType> & Database;
};

export const projectPongoClient = <
  TypedClientSchema extends PongoClientSchema,
  DriverType extends DatabaseDriverType = DatabaseDriverType,
  Database extends PongoDb<DriverType> = PongoDb<DriverType>,
>(
  client: PongoClient<DriverType, Database>,
  schema: TypedClientSchema | undefined,
): PongoClientWithSchema<TypedClientSchema, DriverType, Database> => {
  if (schema === undefined) {
    return client as PongoClientWithSchema<
      TypedClientSchema,
      DriverType,
      Database
    >;
  }

  for (const [alias, database] of objectEntries(schema.dbs)) {
    if (alias in client) {
      throw new Error(
        `Pongo database name ${alias} conflicts with a client API member`,
      );
    }
    Object.defineProperty(client, alias, {
      enumerable: true,
      configurable: false,
      get: () => client.db(database.databaseName ?? alias),
    });
  }

  return client as PongoClientWithSchema<
    TypedClientSchema,
    DriverType,
    Database
  >;
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

export const toDbSchemaMetadata = (
  schema: PongoDatabaseComponent,
): PongoDbSchemaMetadata => ({
  name: schema.databaseName,
  collections: ('collections' in schema
    ? Object.values(schema.collections)
    : Object.values(schema.schemas).flatMap((databaseSchema) =>
        Object.values(databaseSchema.tables),
      )
  ).map((collection) => ({ name: collection.tableName })),
});

export const toClientSchemaMetadata = (
  schema: PongoClientSchema,
): PongoClientSchemaMetadata => {
  const databases = objectEntries(schema.dbs).map(([, database]) =>
    toDbSchemaMetadata(database),
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
