import type {
  columnComponentType,
  schemaComponentType,
  tableComponentType,
} from '@event-driven-io/dumbo';
import {
  databaseComponent,
  databaseSchemaComponent,
  dumboSchema,
  indexComponent,
  isDefaultDatabaseSchema,
  isSchemaComponent,
  isTableComponent,
  jsonDocumentIndexTarget,
  jsonPathIndexTarget,
  SQL,
  type AnyDatabaseComponent,
  type AnyDatabaseSchemaComponent,
  type DatabaseComponent,
  type DatabaseDriverType,
  type DatabaseExtensions,
  type DatabaseSchemaComponent,
  type DatabaseTables,
  type IndexComponent,
  type IndexSQLContext,
  type SchemaExtensions,
  type SQL as SQLStatement,
  type TableComponent,
  type TableRowType,
} from '@event-driven-io/dumbo';
import {
  objectEntries,
  type PongoClient,
  type PongoCollection,
  type PongoDb,
  type PongoDocument,
} from '../typing';

export const pongoCollectionComponentType: unique symbol = Symbol(
  'pongo.collectionComponent',
);

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
    indexes?: Indexes;
  }>,
): TableComponent<PongoCollectionColumns<Document>, Name, Indexes> =>
  table(name, {
    columns: pongoCollectionColumns<Document>(),
    ...options,
    kind: 'pongo_collection',
    primaryKey: ['_id'],
  });

export type PongoCollectionComponent<
  Document extends PongoDocument = PongoDocument,
  Name extends string = string,
  Indexes extends PongoCollectionIndexes = PongoCollectionIndexes,
> = Omit<
  TableComponent<PongoCollectionColumns<Document>, Name, Indexes>,
  'withDatabaseSchemaName' | 'withTableName' | 'rename'
> &
  Readonly<{
    [schemaComponentType]: typeof tableComponentType;
    [pongoCollectionComponentType]: true;
    withDatabaseSchemaName: (
      databaseSchemaName: string,
    ) => PongoCollectionComponent<Document, Name, Indexes>;
    withTableName: <const NewTableName extends string>(
      tableName: NewTableName,
    ) => PongoCollectionComponent<Document, NewTableName, Indexes>;
    rename: <const NewTableName extends string>(
      tableName: NewTableName,
    ) => PongoCollectionComponent<Document, NewTableName, Indexes>;
  }>;

export type PongoSchemaComponent<
  Collections extends Readonly<Record<string, PongoCollectionComponent>> =
    Readonly<Record<string, PongoCollectionComponent>>,
  Name extends string = string,
  Extensions extends SchemaExtensions = SchemaExtensions,
> = DatabaseSchemaComponent<Collections, Name, Extensions>;

export type PongoDatabaseCollections = Readonly<
  Record<string, PongoCollectionComponent>
>;

export type PongoDatabaseSchemas = Readonly<
  Record<string, AnyDatabaseSchemaComponent>
>;

export type PongoDatabaseDefinition<
  Collections extends PongoDatabaseCollections = PongoDatabaseCollections,
  Schemas extends PongoDatabaseSchemas = PongoDatabaseSchemas,
> =
  | Readonly<{
      collections: Collections;
      schemas?: never;
    }>
  | Readonly<{
      collections?: never;
      schemas: Schemas;
    }>;

export type PongoDbSchema = AnyDatabaseComponent;

export interface PongoClientSchema<
  Databases extends Readonly<Record<string, PongoDbSchema>> = Readonly<
    Record<string, PongoDbSchema>
  >,
> {
  dbs: Databases;
}

type PongoDatabaseSchemaKey<T extends PongoDbSchema> =
  T['databaseName'] extends string ? T['databaseName'] : string;

export type PongoClientSchemaFromDefinition<T> = T extends PongoClientSchema
  ? T
  : T extends PongoDbSchema
    ? PongoClientSchema<{ [Key in PongoDatabaseSchemaKey<T>]: T }>
    : PongoClientSchema;

type DocumentOf<Collection extends PongoCollectionComponent> =
  TableRowType<Collection> extends {
    data: infer Document extends PongoDocument;
  }
    ? Document
    : PongoDocument;

export type CollectionsMap<
  Tables extends DatabaseTables,
  Excluded extends PropertyKey = never,
> = {
  [
    Key in keyof Tables as Tables[Key] extends PongoCollectionComponent
      ? Exclude<Key, Excluded>
      : never
  ]: Tables[Key] extends PongoCollectionComponent
    ? PongoCollection<DocumentOf<Tables[Key]>>
    : never;
};

type HasPongoCollections<Tables extends DatabaseTables> = [
  keyof CollectionsMap<Tables>,
] extends [never]
  ? false
  : true;

export type PongoSchemaCollectionsMap<
  Schemas extends AnyDatabaseComponent['schemas'],
> = {
  [
    Key in keyof Schemas as HasPongoCollections<
      Schemas[Key]['tables']
    > extends true
      ? Exclude<Key, keyof PongoDb>
      : never
  ]: CollectionsMap<Schemas[Key]['tables']>;
};

export type PongoDbWithSchema<
  Definition extends PongoDbSchema,
  DriverType extends DatabaseDriverType = DatabaseDriverType,
> = PongoDb<DriverType> &
  CollectionsMap<Definition['tables'], keyof PongoDb> &
  PongoSchemaCollectionsMap<Definition['schemas']>;

export type DBsMap<
  Databases extends Readonly<Record<string, PongoDbSchema>>,
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
    kind: 'pongo_index',
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
    kind: 'pongo_index',
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
    kind: 'pongo_index',
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
  const Indexes extends PongoCollectionIndexes = PongoCollectionIndexes,
>(
  name: Name,
  options: Readonly<{
    indexes?: Indexes;
  }> = {},
): PongoCollectionComponent<Document, Name, Indexes> => {
  const collection = pongoCollectionTable<Document, Name, Indexes>(
    name,
    options,
  );
  return Object.freeze({
    ...collection,
    [pongoCollectionComponentType]: true,
  }) as PongoCollectionComponent<Document, Name, Indexes>;
};

pongoCollection.from = (
  collectionNames: string[],
): Record<string, PongoCollectionComponent> =>
  Object.fromEntries(
    collectionNames.map((name) => [name, pongoCollection(name)]),
  );

const pongoDatabaseSchema = <
  const Collections extends Readonly<Record<string, PongoCollectionComponent>>,
  const Name extends string,
  const Extensions extends SchemaExtensions = EmptyComponentRecord,
>(
  name: Name,
  collections: Collections,
  extensions?: Extensions,
): PongoSchemaComponent<Collections, Name, Extensions> => {
  return databaseSchemaComponent({
    schemaName: name,
    tables: collections,
    extensions,
  });
};

function pongoDatabase<
  const Collections extends PongoDatabaseCollections = EmptyComponentRecord,
  const Schemas extends PongoDatabaseSchemas = EmptyComponentRecord,
  const Extensions extends DatabaseExtensions = EmptyComponentRecord,
>(
  definition: PongoDatabaseDefinition<Collections, Schemas>,
  extensions?: Extensions,
): DatabaseComponent<undefined, Collections, Schemas, Extensions>;
function pongoDatabase<
  const Name extends string,
  const Collections extends PongoDatabaseCollections = EmptyComponentRecord,
  const Schemas extends PongoDatabaseSchemas = EmptyComponentRecord,
  const Extensions extends DatabaseExtensions = EmptyComponentRecord,
>(
  name: Name,
  definition: PongoDatabaseDefinition<Collections, Schemas>,
  extensions?: Extensions,
): DatabaseComponent<Name, Collections, Schemas, Extensions>;
function pongoDatabase(
  nameOrDefinition: string | PongoDatabaseDefinition,
  definitionOrExtensions?: PongoDatabaseDefinition | DatabaseExtensions,
  extensions?: DatabaseExtensions,
): AnyDatabaseComponent {
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

  const hasCollections = definition.collections !== undefined;
  const hasSchemas = definition.schemas !== undefined;
  if (hasCollections === hasSchemas) {
    throw new Error(
      'A Pongo database declaration must contain exactly one of collections or schemas',
    );
  }

  return hasCollections
    ? databaseComponent({
        databaseName,
        tables: definition.collections,
        extensions: databaseExtensions,
      })
    : databaseComponent({
        databaseName,
        schemas: definition.schemas,
        extensions: databaseExtensions,
      });
}

pongoDatabase.from = (
  databaseName: string | undefined,
  collections: ReadonlyArray<string | PongoCollectionSchemaMetadata>,
): AnyDatabaseComponent => {
  const placed = collections.map((collection) =>
    typeof collection === 'string' ? { name: collection } : collection,
  );

  const collectionsIn = (databaseSchemaName: string) =>
    pongoCollection.from(
      placed
        .filter(
          (collection) => collection.databaseSchemaName === databaseSchemaName,
        )
        .map(({ name }) => name),
    );

  const inDefaultSchema = placed
    .filter(({ databaseSchemaName }) =>
      isDefaultDatabaseSchema(databaseSchemaName),
    )
    .map(({ name }) => name);

  const databaseSchemaNames = [
    ...new Set(
      placed
        .map(({ databaseSchemaName }) => databaseSchemaName)
        .filter((name): name is string => !isDefaultDatabaseSchema(name)),
    ),
  ];

  const definition = { collections: pongoCollection.from(inDefaultSchema) };

  return databaseSchemaNames.reduce<AnyDatabaseComponent>(
    (database, databaseSchemaName) =>
      database.withTable(collectionsIn(databaseSchemaName), databaseSchemaName),
    databaseName === undefined
      ? pongoDatabase(definition)
      : pongoDatabase(databaseName, definition),
  );
};

const pongoClientSchema = <
  const Databases extends Readonly<Record<string, PongoDbSchema>>,
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

export type PongoCollectionSchemaMetadata = {
  name: string;
  databaseSchemaName?: string | undefined;
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
  schema: PongoDbSchema,
): PongoDbSchemaMetadata => ({
  name: schema.databaseName,
  collections: Object.values(schema.schemas).flatMap((databaseSchema) =>
    Object.values(databaseSchema.tables)
      .filter(isPongoCollectionComponent)
      .map((collection) => ({
        name: collection.tableName,
        databaseSchemaName: databaseSchema.schemaName,
      })),
  ),
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
