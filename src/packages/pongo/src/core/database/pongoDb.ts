import type { JSONSerializer, SQL } from '@event-driven-io/dumbo';
import {
  runSQLMigrations,
  type DatabaseDriverType,
  type Dumbo,
  type MigrationStyle,
  type MigrationTableOptions,
  type QueryResult,
  type QueryResultRow,
  type SQLCommandOptions,
  type SQLQueryOptions,
} from '@event-driven-io/dumbo';
import { pongoCache, type CacheConfig, type PongoCache } from '../cache';
import { pongoCollection, transactionExecutorOrDefault } from '../collection';
import { pongoSchema, projectPongoDb, type PongoDbSchema } from '../schema';
import type {
  AnyPongoDb,
  CollectionOperationOptions,
  Document,
  PongoCollection,
  PongoDb,
  PongoDBCollectionOptions,
  PongoMigrationOptions,
  PongoSchemaAccessor,
  PongoSchemaScope,
} from '../typing';
import type { PongoNestedTransactionOptions } from '../pongoTransaction';
import type { PongoRuntimeDatabaseComponent } from './pongoDatabaseSchemaComponent';

type PongoTransactionOptionsFor<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DumboType extends Dumbo<DatabaseDriverType, any>,
> =
  NonNullable<
    Parameters<DumboType['transaction']>[0]
  > extends PongoNestedTransactionOptions
    ? NonNullable<Parameters<DumboType['transaction']>[0]>
    : PongoNestedTransactionOptions;

export type PongoDatabaseOptions<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DumboType extends Dumbo<DatabaseDriverType, any> = Dumbo<
    DatabaseDriverType,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >,
  Definition extends PongoDbSchema = PongoDbSchema,
> = {
  databaseName: string;
  pool: DumboType;
  serializer: JSONSerializer;
  schemaComponent: PongoRuntimeDatabaseComponent<DumboType['driverType']>;
  defaultSchemaName: string;
  migrationTable?: MigrationTableOptions | undefined;
  schema?:
    | {
        autoMigration?: MigrationStyle;
        definition?: Definition;
      }
    | undefined;
  errors?: { throwOnOperationFailures?: boolean } | undefined;
  cache?: CacheConfig | 'disabled' | PongoCache | undefined;
  transactionOptions?: PongoTransactionOptionsFor<DumboType> | undefined;
};

export const PongoDatabase = <
  Database extends AnyPongoDb = AnyPongoDb,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DumboType extends Dumbo<Database['driverType'], any> = Dumbo<
    Database['driverType'],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >,
>(
  options: PongoDatabaseOptions<DumboType>,
): Database => {
  const {
    databaseName,
    schemaComponent,
    pool,
    cache: cacheOptions,
    serializer,
  } = options;
  const defaultSchemaName = options.defaultSchemaName;

  const cache =
    cacheOptions === 'disabled' || cacheOptions === undefined
      ? 'disabled'
      : pongoCache(cacheOptions);

  const collections = new Map<string, Map<string, PongoCollection<Document>>>();
  const collectionsIn = (schemaName: string) => {
    let schemaCollections = collections.get(schemaName);
    if (!schemaCollections) {
      schemaCollections = new Map<string, PongoCollection<Document>>();
      collections.set(schemaName, schemaCollections);
    }
    return schemaCollections;
  };
  const allCollections = () =>
    [...collections.values()].flatMap((schemaCollections) => [
      ...schemaCollections.values(),
    ]);
  const command = async <Result extends QueryResultRow = QueryResultRow>(
    sql: SQL,
    options?: CollectionOperationOptions & SQLCommandOptions,
  ) =>
    (
      await transactionExecutorOrDefault(db, options, pool.execute)
    ).command<Result>(sql, options);

  const query = async <T extends QueryResultRow>(
    sql: SQL,
    options?: CollectionOperationOptions & SQLQueryOptions,
  ) =>
    (await transactionExecutorOrDefault(db, options, pool.execute)).query<T>(
      sql,
      options,
    );

  const driverType = pool.driverType as Database['driverType'];
  const defaultTransactionOptions = options.transactionOptions;
  const pongoTransactionOptions = (
    transactionOptions?: PongoTransactionOptionsFor<DumboType>,
  ): PongoTransactionOptionsFor<DumboType> => {
    const nestedTransactionOptions = transactionOptions as
      PongoNestedTransactionOptions | undefined;
    const nestedDefaultTransactionOptions = defaultTransactionOptions as
      PongoNestedTransactionOptions | undefined;
    const allowNestedTransactions: boolean =
      nestedTransactionOptions?.allowNestedTransactions ??
      nestedDefaultTransactionOptions?.allowNestedTransactions ??
      true;

    return {
      ...(defaultTransactionOptions ?? {}),
      allowNestedTransactions,
      ...(transactionOptions ?? {}),
    };
  };

  const schemaScopes = new Map<string, PongoSchemaScope>();
  const schemaScope = (schemaName = defaultSchemaName): PongoSchemaScope => {
    const existing = schemaScopes.get(schemaName);
    if (existing !== undefined) return existing;

    const scope: PongoSchemaScope = {
      collection: <T extends Document, Payload extends Document = T>(
        collectionName: string,
        collectionOptions?: Omit<
          PongoDBCollectionOptions<T, Payload>,
          'schemaName'
        >,
      ) =>
        db.collection<T, Payload>(collectionName, {
          ...collectionOptions,
          schemaName,
        }),
      collections: () => [...(collections.get(schemaName)?.values() ?? [])],
    };
    schemaScopes.set(schemaName, scope);
    return scope;
  };

  const migrate = (migrationOptions?: PongoMigrationOptions) => {
    const { migrationTable, ...optionsWithoutMigrationTable } =
      migrationOptions ?? {};
    const resolvedMigrationTable = migrationTable ?? options.migrationTable;

    return runSQLMigrations(pool, schemaComponent.migrations, {
      ...optionsWithoutMigrationTable,
      ...(resolvedMigrationTable
        ? { schema: { migrationTable: resolvedMigrationTable } }
        : {}),
    });
  };

  const schemaAccessor = Object.assign(schemaScope, {
    component: schemaComponent,
    definition: schemaComponent.definition,
    migrate,
  }) as PongoSchemaAccessor<Database['driverType']>;
  Object.defineProperty(schemaAccessor, 'migrations', {
    enumerable: true,
    get: () => schemaComponent.migrations,
  });

  const db: PongoDb<Database['driverType']> = {
    driverType,
    databaseName,
    connect: () => Promise.resolve(),
    close: async () => {
      await Promise.allSettled([
        pool.close(),
        cache !== 'disabled' ? cache.close() : Promise.resolve(),
        ...allCollections().map((collection) => collection.close()),
      ]);
    },

    collections: allCollections,
    collection: <T extends Document, Payload extends Document = T>(
      collectionName: string,
      collectionOptions?: PongoDBCollectionOptions<T, Payload>,
    ) => {
      const databaseSchemaName =
        collectionOptions?.schemaName ?? defaultSchemaName;
      const schemaCollections = collectionsIn(databaseSchemaName);
      const collectionSchema = pongoSchema.collection<T>(collectionName);
      const collectionRuntimeSchema = collectionOptions?.schema;
      const hasRuntimeOverrides =
        collectionOptions?.cache !== undefined ||
        collectionOptions?.errors !== undefined ||
        collectionRuntimeSchema !== undefined;

      const existing = schemaCollections.get(collectionName) as
        PongoCollection<T> | undefined;

      if (!hasRuntimeOverrides && existing) return existing;

      const collection = pongoCollection({
        collectionName,
        db,
        pool,
        schemaComponent: schemaComponent.collection(
          collectionSchema,
          databaseSchemaName,
        ),
        schema: { ...options.schema, ...collectionRuntimeSchema },
        serializer,
        errors: { ...options.errors, ...collectionOptions?.errors },
        cache:
          collectionOptions?.cache !== undefined
            ? collectionOptions.cache
            : cache,
      });

      if (!hasRuntimeOverrides) {
        schemaCollections.set(
          collectionName,
          collection as unknown as PongoCollection<Document>,
        );
      }
      return collection;
    },
    transaction: (transactionOptions) =>
      pool.transaction(
        pongoTransactionOptions(
          transactionOptions as
            PongoTransactionOptionsFor<DumboType> | undefined,
        ),
      ),
    withTransaction: (handle, transactionOptions) =>
      pool.withTransaction(
        handle,
        pongoTransactionOptions(
          transactionOptions as
            PongoTransactionOptionsFor<DumboType> | undefined,
        ),
      ),

    schema: schemaAccessor,
    sql: {
      async query<Result extends QueryResultRow = QueryResultRow>(
        sql: SQL,
        options?: CollectionOperationOptions & SQLQueryOptions,
      ): Promise<Result[]> {
        const result = await query<Result>(sql, options);
        return result.rows;
      },
      async command<Result extends QueryResultRow = QueryResultRow>(
        sql: SQL,
        options?: CollectionOperationOptions & SQLCommandOptions,
      ): Promise<QueryResult<Result>> {
        return command(sql, options);
      },
    },
  };

  const typedDb = db as unknown as Database;

  const dbSchema = schemaComponent.definition;

  if (
    ('collections' in dbSchema &&
      Object.keys(dbSchema.collections).length > 0) ||
    Object.keys(dbSchema.schemas).length > 0
  ) {
    return projectPongoDb(typedDb, dbSchema);
  }

  return typedDb;
};
