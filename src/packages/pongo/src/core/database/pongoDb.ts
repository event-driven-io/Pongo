import type { JSONSerializer, SQL } from '@event-driven-io/dumbo';
import {
  databaseMigrations,
  runSQLMigrations,
  withTable,
  type DatabaseComponent,
  type DatabaseDriverType,
  type DatabaseMigrationBuilder,
  type Dumbo,
  type MigrationStyle,
  type MigrationTableOptions,
  type QueryResult,
  type QueryResultRow,
  type SQLCommandOptions,
  type SQLQueryOptions,
} from '@event-driven-io/dumbo';
import { pongoCache, type CacheConfig, type PongoCache } from '../cache';
import {
  pongoCollection,
  transactionExecutorOrDefault,
  type PongoCollectionSQLBuilder,
} from '../collection';
import {
  pongoSchema,
  projectPongoDb,
  isPongoCollectionComponent,
  type PongoCollectionComponent,
  type PongoDbSchema,
} from '../schema';
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
import { composePongoDatabase } from './pongoDatabaseSchemaComponent';

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
  defaultSchemaName: string;
  migrationBuilder?: DatabaseMigrationBuilder | undefined;
  sqlBuilderFor: (
    collection: PongoCollectionComponent,
    identifier: {
      databaseSchemaName: string;
      tableName: string;
    },
  ) => PongoCollectionSQLBuilder;
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
  const { databaseName, pool, cache: cacheOptions, serializer } = options;
  const defaultSchemaName = options.defaultSchemaName;
  const definition =
    options.schema?.definition ?? pongoSchema.db({ collections: {} });
  let databaseComponent: DatabaseComponent = composePongoDatabase({
    databaseName,
    defaultSchemaName,
    definition,
  });

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
          'databaseSchemaName'
        >,
      ) => {
        const requestedDatabaseSchemaName =
          collectionOptions !== undefined &&
          'databaseSchemaName' in collectionOptions
            ? collectionOptions.databaseSchemaName
            : undefined;
        if (
          typeof requestedDatabaseSchemaName === 'string' &&
          requestedDatabaseSchemaName !== schemaName
        ) {
          throw new Error(
            `Pongo schema scope "${schemaName}" cannot place a collection in database schema "${requestedDatabaseSchemaName}"`,
          );
        }
        return db.collection<T, Payload>(collectionName, {
          ...collectionOptions,
          databaseSchemaName: schemaName,
        });
      },
      collections: () => [...(collections.get(schemaName)?.values() ?? [])],
    };
    schemaScopes.set(schemaName, scope);
    return scope;
  };

  const migrate = (migrationOptions?: PongoMigrationOptions) => {
    const { migrationTable, ...optionsWithoutMigrationTable } =
      migrationOptions ?? {};
    const resolvedMigrationTable = migrationTable ?? options.migrationTable;

    return runSQLMigrations(
      pool,
      databaseMigrations(databaseComponent, options.migrationBuilder ?? {}),
      {
        ...optionsWithoutMigrationTable,
        ...(resolvedMigrationTable
          ? { schema: { migrationTable: resolvedMigrationTable } }
          : {}),
      },
    );
  };

  const schemaAccessor = schemaScope as PongoSchemaAccessor;
  Object.defineProperties(schemaAccessor, {
    component: { enumerable: true, get: () => databaseComponent },
    definition: { enumerable: true, value: definition },
    migrations: {
      enumerable: true,
      get: () =>
        databaseMigrations(databaseComponent, options.migrationBuilder ?? {}),
    },
    migrate: { enumerable: true, value: migrate },
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
        collectionOptions?.databaseSchemaName ?? defaultSchemaName;
      const schemaCollections = collectionsIn(databaseSchemaName);
      const declared = Object.values(
        databaseComponent.schemas[databaseSchemaName]?.tables ?? {},
      ).find(
        (table) =>
          isPongoCollectionComponent(table) &&
          table.tableName === collectionName,
      );
      const collectionSchema =
        declared !== undefined && isPongoCollectionComponent(declared)
          ? declared
          : pongoSchema.collection<T>(collectionName, {
              databaseSchemaName,
            });
      const collectionRuntimeSchema = collectionOptions?.schema;
      const hasRuntimeOverrides =
        collectionOptions?.cache !== undefined ||
        collectionOptions?.errors !== undefined ||
        collectionRuntimeSchema !== undefined;

      const existing = schemaCollections.get(collectionName) as
        PongoCollection<T> | undefined;

      if (!hasRuntimeOverrides && existing) return existing;

      if (declared === undefined) {
        databaseComponent = withTable(
          databaseComponent,
          databaseSchemaName,
          collectionName,
          collectionSchema,
        );
      }
      const identifier = {
        databaseSchemaName,
        tableName: collectionName,
      };
      const collection = pongoCollection({
        collectionName,
        db,
        pool,
        component: collectionSchema,
        databaseSchemaName,
        sqlBuilder: options.sqlBuilderFor(collectionSchema, identifier),
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

  const dbSchema = definition;

  if (
    ('collections' in dbSchema &&
      Object.keys(dbSchema.collections).length > 0) ||
    Object.keys(dbSchema.schemas).length > 0
  ) {
    return projectPongoDb(typedDb, dbSchema);
  }

  return typedDb;
};
