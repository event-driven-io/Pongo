import type { JSONSerializer, SQL } from '@event-driven-io/dumbo';
import {
  runSQLMigrations,
  SQLDefaultSchemaNameToken,
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
import type { PongoCollectionComponent, PongoDbSchema } from '../schema';
import type {
  AnyPongoDb,
  CollectionOperationOptions,
  PongoDb,
  PongoMigrationOptions,
} from '../typing';
import type { PongoNestedTransactionOptions } from '../pongoTransaction';
import {
  PongoDatabaseComponent,
  type PongoCollectionIdentifier,
} from './pongoDatabaseComponent';

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
    identifier: PongoCollectionIdentifier,
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
  const defaultSchemaName: string | SQLDefaultSchemaNameToken =
    options.defaultSchemaName ?? SQLDefaultSchemaNameToken.from();

  const cache =
    cacheOptions === 'disabled' || cacheOptions === undefined
      ? 'disabled'
      : pongoCache(cacheOptions);
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

  const databaseComponent = PongoDatabaseComponent({
    component: options.schema?.definition,
    defaultSchemaName,
    createCollection: (component, identifier, collectionOptions) => {
      const collectionName = identifier.tableName;
      const collectionRuntimeSchema = collectionOptions?.schema;

      return pongoCollection({
        collectionName,
        db,
        pool,
        component,
        databaseSchemaName: identifier.databaseSchemaName,
        sqlBuilder: options.sqlBuilderFor(component, identifier),
        schema: { ...options.schema, ...collectionRuntimeSchema },
        serializer,
        errors: { ...options.errors, ...collectionOptions?.errors },
        cache:
          collectionOptions?.cache !== undefined
            ? collectionOptions.cache
            : cache,
      });
    },
  });

  const migrate = (migrationOptions?: PongoMigrationOptions) =>
    runSQLMigrations(pool, databaseComponent.migrations, {
      ...migrationOptions,
      migrationTable:
        migrationOptions?.migrationTable ?? options.migrationTable,
    });

  const core: PongoDb<Database['driverType']> = {
    driverType,
    databaseName,
    connect: () => Promise.resolve(),
    close: async () => {
      await Promise.allSettled([
        pool.close(),
        cache !== 'disabled' ? cache.close() : Promise.resolve(),
        ...databaseComponent
          .collections()
          .map((collection) => collection.close()),
      ]);
    },

    collections: databaseComponent.collections,
    collection: databaseComponent.collection,
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

    schema: {
      get component() {
        return databaseComponent.component;
      },
      get migrations() {
        return databaseComponent.migrations;
      },
      migrate,
    },
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

  const db = databaseComponent.expose(core) as Database;

  return db;
};
