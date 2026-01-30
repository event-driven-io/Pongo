import {
  runSQLMigrations,
  SQL,
  type DatabaseDriverType,
  type Dumbo,
  type MigrationStyle,
  type QueryResult,
  type QueryResultRow,
} from '@event-driven-io/dumbo';
import { pongoCollection, transactionExecutorOrDefault } from '../collection';
import {
  pongoSchema,
  proxyPongoDbWithSchema,
  type PongoCollectionSchema,
  type PongoDbSchema,
} from '../schema';
import {
  type AnyPongoDb,
  type CollectionOperationOptions,
  type Document,
  type PongoCollection,
  type PongoDb,
  type PongoDBCollectionOptions,
} from '../typing';
import { type PongoDatabaseSchemaComponent } from './pongoDatabaseSchemaComponent';

export type PongoDatabaseOptions<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DumboType extends Dumbo<DatabaseDriverType, any> = Dumbo<
    DatabaseDriverType,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >,
  CollectionsSchema extends Record<string, PongoCollectionSchema> = Record<
    string,
    PongoCollectionSchema
  >,
> = {
  databaseName: string;
  pool: DumboType;
  schemaComponent: PongoDatabaseSchemaComponent<DumboType['driverType']>;
  schema?:
    | {
        autoMigration?: MigrationStyle;
        definition?: PongoDbSchema<CollectionsSchema>;
      }
    | undefined;
  errors?: { throwOnOperationFailures?: boolean } | undefined;
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
  const { databaseName, schemaComponent, pool } = options;

  const collections = new Map<string, PongoCollection<Document>>();

  const command = async <Result extends QueryResultRow = QueryResultRow>(
    sql: SQL,
    options?: CollectionOperationOptions,
  ) =>
    (
      await transactionExecutorOrDefault(db, options, pool.execute)
    ).command<Result>(sql);

  const query = async <T extends QueryResultRow>(
    sql: SQL,
    options?: CollectionOperationOptions,
  ) =>
    (await transactionExecutorOrDefault(db, options, pool.execute)).query<T>(
      sql,
    );

  const driverType = pool.driverType as Database['driverType'];

  const db = {
    driverType,
    databaseName,
    connect: () => Promise.resolve(),
    close: () => pool.close(),

    collections: () => [...collections.values()],
    collection: <T extends Document>(
      collectionName: string,
      collectionOptions?: PongoDBCollectionOptions<T>,
    ) =>
      (collections.get(collectionName) as PongoCollection<T> | undefined) ??
      pongoCollection({
        collectionName,
        db,
        pool,
        schemaComponent: schemaComponent.collection(
          pongoSchema.collection<T>(collectionName),
        ),
        schema: { ...options.schema, ...collectionOptions?.schema },
        errors: { ...options.errors, ...collectionOptions?.errors },
      }),
    transaction: () => pool.transaction(),
    withTransaction: (handle) => pool.withTransaction(handle),

    schema: {
      component: schemaComponent,
      migrate: () => runSQLMigrations(pool, schemaComponent.migrations),
    },

    sql: {
      async query<Result extends QueryResultRow = QueryResultRow>(
        sql: SQL,
        options?: CollectionOperationOptions,
      ): Promise<Result[]> {
        const result = await query<Result>(sql, options);
        return result.rows;
      },
      async command<Result extends QueryResultRow = QueryResultRow>(
        sql: SQL,
        options?: CollectionOperationOptions,
      ): Promise<QueryResult<Result>> {
        return command(sql, options);
      },
    },
  } satisfies PongoDb<Database['driverType']> as unknown as Database;

  const dbSchema = options?.schema?.definition;

  if (dbSchema) {
    return proxyPongoDbWithSchema(db, dbSchema, collections);
  }

  return db;
};
