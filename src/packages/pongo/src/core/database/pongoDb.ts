import type { JSONSerializer, SQL } from '@event-driven-io/dumbo';
import {
  databaseSchemaComponent,
  dedupeMigrations,
  findTable,
  runSQLMigrations,
  SQLDefaultSchemaNameToken,
  type AnyDatabaseSchemaComponent,
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
  defaultSchemaName?: string | undefined;
  sqlBuilderFor: (
    collection: PongoCollectionComponent,
    identifier: {
      databaseSchemaName: string | SQLDefaultSchemaNameToken;
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

const databaseSchemaLabel = (
  databaseSchemaName: string | SQLDefaultSchemaNameToken,
): string =>
  typeof databaseSchemaName === 'string'
    ? `database schema "${databaseSchemaName}"`
    : 'the default database schema';

/**
 * Declared components stay immutable, so collections created through
 * `db.collection` live in this overlay instead. The logical default scope is a
 * field of its own, because its placement is either a configured name or a
 * token that no two instances share and that therefore cannot key a map.
 */
const pongoDatabaseSchemas = (
  component: PongoDbSchema,
  defaultSchemaName: string | SQLDefaultSchemaNameToken,
) => {
  const defaults =
    typeof defaultSchemaName === 'string'
      ? { schemaName: defaultSchemaName }
      : undefined;
  const defaultScope = new Map<string, PongoCollectionComponent>();
  const namedScopes = new Map<
    string,
    {
      schema: AnyDatabaseSchemaComponent | undefined;
      collections: Map<string, PongoCollectionComponent>;
    }
  >();

  const namedScope = (databaseSchemaName: string) => {
    const existing = namedScopes.get(databaseSchemaName);
    if (existing !== undefined) return existing;

    const scope = {
      schema:
        component.schemas[databaseSchemaName] === undefined
          ? databaseSchemaComponent({ schemaName: databaseSchemaName })
          : undefined,
      collections: new Map<string, PongoCollectionComponent>(),
    };
    namedScopes.set(databaseSchemaName, scope);
    return scope;
  };

  return {
    component,
    migrations: () =>
      dedupeMigrations([
        ...component.migrations(
          defaults === undefined ? undefined : { defaults },
        ),
        ...[...defaultScope.values()].flatMap((collection) =>
          collection.migrations({ databaseSchemaName: defaultSchemaName }),
        ),
        ...[...namedScopes].flatMap(([databaseSchemaName, scope]) => [
          ...(scope.schema?.migrations() ?? []),
          ...[...scope.collections.values()].flatMap((collection) =>
            collection.migrations({ databaseSchemaName }),
          ),
        ]),
      ]),
    collection: <T extends Document>(
      collectionName: string,
      requestedSchemaName: string | undefined,
    ) => {
      const databaseSchemaName = requestedSchemaName ?? defaultSchemaName;
      const identifier = { databaseSchemaName, tableName: collectionName };
      const declared = findTable(component, { ...identifier, defaults })?.table;

      if (declared !== undefined) {
        if (!isPongoCollectionComponent(declared)) {
          throw new Error(
            `Table "${collectionName}" in ${databaseSchemaLabel(databaseSchemaName)} is not a Pongo collection`,
          );
        }
        return { component: declared, identifier };
      }

      const dynamic =
        typeof databaseSchemaName === 'string' &&
        databaseSchemaName !== defaultSchemaName
          ? namedScope(databaseSchemaName).collections
          : defaultScope;
      const existing = dynamic.get(collectionName);

      if (existing !== undefined) return { component: existing, identifier };

      const created = pongoSchema.collection<T>(
        collectionName,
        requestedSchemaName !== undefined
          ? { databaseSchemaName: requestedSchemaName }
          : {},
      );
      dynamic.set(collectionName, created);

      return { component: created, identifier };
    },
  };
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
  const defaultSchemaName: string | SQLDefaultSchemaNameToken =
    options.defaultSchemaName ?? SQLDefaultSchemaNameToken.from();
  const definition =
    options.schema?.definition ?? pongoSchema.db({ collections: {} });
  const schemas = pongoDatabaseSchemas(definition, defaultSchemaName);

  const cache =
    cacheOptions === 'disabled' || cacheOptions === undefined
      ? 'disabled'
      : pongoCache(cacheOptions);

  const defaultSchemaCollections = new Map<string, PongoCollection<Document>>();
  const collections = new Map<string, Map<string, PongoCollection<Document>>>();
  const collectionsIn = (schemaName: string | undefined) => {
    if (schemaName === undefined || schemaName === defaultSchemaName)
      return defaultSchemaCollections;

    let schemaCollections = collections.get(schemaName);
    if (!schemaCollections) {
      schemaCollections = new Map<string, PongoCollection<Document>>();
      collections.set(schemaName, schemaCollections);
    }
    return schemaCollections;
  };
  const allCollections = () =>
    [defaultSchemaCollections, ...collections.values()].flatMap(
      (schemaCollections) => [...schemaCollections.values()],
    );
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

  let defaultSchemaScope: PongoSchemaScope | undefined;
  const schemaScopes = new Map<string, PongoSchemaScope>();
  const schemaScope = (schemaName?: string): PongoSchemaScope => {
    const existing =
      schemaName === undefined
        ? defaultSchemaScope
        : schemaScopes.get(schemaName);
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
            `Pongo schema scope ${schemaName === undefined ? 'without a name' : `"${schemaName}"`} cannot place a collection in database schema "${requestedDatabaseSchemaName}"`,
          );
        }
        return db.collection<T, Payload>(collectionName, {
          ...collectionOptions,
          databaseSchemaName: schemaName,
        });
      },
      collections: () => [...collectionsIn(schemaName).values()],
    };
    if (schemaName === undefined) defaultSchemaScope = scope;
    else schemaScopes.set(schemaName, scope);
    return scope;
  };

  const migrate = (migrationOptions?: PongoMigrationOptions) =>
    runSQLMigrations(pool, schemas.migrations(), {
      ...migrationOptions,
      migrationTable:
        migrationOptions?.migrationTable ?? options.migrationTable,
    });

  const schemaAccessor = schemaScope as PongoSchemaAccessor;
  Object.defineProperties(schemaAccessor, {
    component: { enumerable: true, value: schemas.component },
    migrations: {
      enumerable: true,
      get: () => schemas.migrations(),
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
      const requestedSchemaName = collectionOptions?.databaseSchemaName;
      const schemaCollections = collectionsIn(requestedSchemaName);
      const collectionRuntimeSchema = collectionOptions?.schema;
      const hasRuntimeOverrides =
        collectionOptions?.cache !== undefined ||
        collectionOptions?.errors !== undefined ||
        collectionRuntimeSchema !== undefined;

      const existing = schemaCollections.get(collectionName) as
        PongoCollection<T> | undefined;

      if (!hasRuntimeOverrides && existing) return existing;

      const schemaCollection = schemas.collection<T>(
        collectionName,
        requestedSchemaName,
      );
      const collection = pongoCollection({
        collectionName,
        db,
        pool,
        component: schemaCollection.component,
        databaseSchemaName: schemaCollection.identifier.databaseSchemaName,
        sqlBuilder: options.sqlBuilderFor(
          schemaCollection.component,
          schemaCollection.identifier,
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

  const dbSchema = definition;

  if (
    ('collections' in dbSchema &&
      Object.keys(dbSchema.collections).length > 0) ||
    Object.keys(dbSchema.defaultSchema.tables).length > 0 ||
    Object.keys(dbSchema.schemas).length > 0
  ) {
    return projectPongoDb(typedDb, dbSchema);
  }

  return typedDb;
};
