import type { JSONSerializer, SQL } from '@event-driven-io/dumbo';
import {
  DefaultDatabaseSchemaName,
  databaseMigrator,
  type DatabaseMigrator,
  type DatabaseDriverType,
  type Dumbo,
  type MigrationStyle,
  type MigratorRunOptions,
  type SQLExecutor,
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
import type { PongoNestedTransactionOptions } from '../pongoTransaction';
import type { PongoCollectionComponent, PongoDbSchema } from '../schema';
import type {
  AnyPongoDb,
  CollectionOperationOptions,
  PongoDb,
  PongoDbTransaction,
  PongoMigrationOptions,
  PongoSession,
} from '../typing';
import { PongoDatabaseComponent } from './pongoDatabaseComponent';

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
  ) => PongoCollectionSQLBuilder;
  migrationTable?: MigrationTableOptions | undefined;
  migrationOptions?: MigratorRunOptions | undefined;
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
  const defaultSchemaName: string =
    options.defaultSchemaName ?? DefaultDatabaseSchemaName;

  const cache =
    cacheOptions === 'disabled' || cacheOptions === undefined
      ? 'disabled'
      : pongoCache(cacheOptions);
  const command = async <Result extends QueryResultRow = QueryResultRow>(
    sql: SQL,
    options?: CollectionOperationOptions & SQLCommandOptions,
  ) => {
    await ensureSchema(options);
    return (
      await transactionExecutorOrDefault(db, options, pool.execute)
    ).command<Result>(sql, options);
  };

  const query = async <T extends QueryResultRow>(
    sql: SQL,
    options?: CollectionOperationOptions & SQLQueryOptions,
  ) => {
    await ensureSchema(options);
    return (
      await transactionExecutorOrDefault(db, options, pool.execute)
    ).query<T>(sql, options);
  };

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
    createCollection: (component, collectionOptions) => {
      const collectionRuntimeSchema = collectionOptions?.schema;

      return pongoCollection({
        db,
        pool,
        ensureSchema,
        component,
        sqlBuilderFor: options.sqlBuilderFor,
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

  let migrationTable = options.migrationTable;
  const createMigrator = (component: PongoDbSchema, execute?: SQLExecutor) =>
    databaseMigrator({
      ...options.migrationOptions,
      component,
      pool,
      autoMigration: options.schema?.autoMigration ?? 'CreateOrUpdate',
      migrationTable,
      transactionOptions: pongoTransactionOptions(),
      execute: execute ?? options.migrationOptions?.execute,
    });

  let migrator = createMigrator(databaseComponent.component);
  const currentMigrator = () => {
    if (migrator.component !== databaseComponent.component)
      migrator = createMigrator(databaseComponent.component);
    return migrator;
  };

  let sessionMigrators = new WeakMap<
    PongoDbTransaction,
    { component: PongoDbSchema; migrator: Promise<DatabaseMigrator> }
  >();
  const migratorFor = (session?: PongoSession) => {
    const transaction = session?.transaction;
    if (!transaction?.isActive) return Promise.resolve(currentMigrator());

    const component = databaseComponent.component;
    const cached = sessionMigrators.get(transaction);
    if (cached?.component === component) return cached.migrator;

    const pending = transaction
      .enlistDatabase(db)
      .then(({ execute }) => createMigrator(component, execute));
    const entry = { component, migrator: pending };
    sessionMigrators.set(transaction, entry);
    void pending.catch(() => {
      if (sessionMigrators.get(transaction) === entry)
        sessionMigrators.delete(transaction);
    });
    return pending;
  };

  const ensureSchema = async (operationOptions?: CollectionOperationOptions) =>
    (await migratorFor(operationOptions?.session)).ensureMigrated();

  const migrate = async (migrationOptions?: PongoMigrationOptions) => {
    if (migrationOptions?.migrationTable !== undefined) {
      migrationTable = migrationOptions.migrationTable;
      migrator = createMigrator(databaseComponent.component);
      sessionMigrators = new WeakMap();
    }
    return (await migratorFor(migrationOptions?.session)).migrate(
      migrationOptions,
    );
  };

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
      sql: () => currentMigrator().sql(),
      print: () => currentMigrator().print(),
      ensureMigrated: () => currentMigrator().ensureMigrated(),
      migrate,
      renameCollection: databaseComponent.renameCollection,
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
