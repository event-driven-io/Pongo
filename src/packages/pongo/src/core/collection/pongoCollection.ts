import {
  runPostgreSQLMigrations,
  schemaComponent,
  single,
  type DatabaseTransaction,
  type Dumbo,
  type MigrationStyle,
  type QueryResultRow,
  type SchemaComponent,
  type SQL,
  type SQLExecutor,
  type SQLMigration,
} from '@event-driven-io/dumbo';
import { v4 as uuid } from 'uuid';
import {
  operationResult,
  type CollectionOperationOptions,
  type DeleteManyOptions,
  type DeleteOneOptions,
  type DocumentHandler,
  type InsertManyOptions,
  type InsertOneOptions,
  type OptionalUnlessRequiredIdAndVersion,
  type PongoCollection,
  type PongoDb,
  type PongoDeleteResult,
  type PongoDocument,
  type PongoFilter,
  type PongoInsertManyResult,
  type PongoInsertOneResult,
  type PongoUpdate,
  type PongoUpdateResult,
  type ReplaceOneOptions,
  type UpdateManyOptions,
  type UpdateOneOptions,
  type UpsertOneOptions,
  type WithoutId,
} from '..';
import { pongoCollectionPostgreSQLMigrations } from '../../postgres';

export type PongoCollectionOptions<ConnectorType extends string = string> = {
  db: PongoDb<ConnectorType>;
  collectionName: string;
  pool: Dumbo;
  sqlBuilder: PongoCollectionSQLBuilder;
  schema?: { autoMigration?: MigrationStyle };
  errors?: { throwOnOperationFailures?: boolean };
};

const enlistIntoTransactionIfActive = async <
  ConnectorType extends string = string,
>(
  db: PongoDb<ConnectorType>,
  options: CollectionOperationOptions | undefined,
): Promise<DatabaseTransaction | null> => {
  const transaction = options?.session?.transaction;

  if (!transaction || !transaction.isActive) return null;

  return await transaction.enlistDatabase(db);
};

const transactionExecutorOrDefault = async <
  ConnectorType extends string = string,
>(
  db: PongoDb<ConnectorType>,
  options: CollectionOperationOptions | undefined,
  defaultSqlExecutor: SQLExecutor,
): Promise<SQLExecutor> => {
  const existingTransaction = await enlistIntoTransactionIfActive(db, options);
  return existingTransaction?.execute ?? defaultSqlExecutor;
};

export const pongoCollection = <
  T extends PongoDocument,
  ConnectorType extends string = string,
>({
  db,
  collectionName,
  pool,
  sqlBuilder: SqlFor,
  schema,
  errors,
}: PongoCollectionOptions<ConnectorType>): PongoCollection<T> => {
  const sqlExecutor = pool.execute;
  const command = async <Result extends QueryResultRow = QueryResultRow>(
    sql: SQL,
    options?: CollectionOperationOptions,
  ) =>
    (
      await transactionExecutorOrDefault(db, options, sqlExecutor)
    ).command<Result>(sql);

  const query = async <T extends QueryResultRow>(
    sql: SQL,
    options?: CollectionOperationOptions,
  ) =>
    (await transactionExecutorOrDefault(db, options, sqlExecutor)).query<T>(
      sql,
    );

  let shouldMigrate = schema?.autoMigration !== 'None';

  const createCollection = (options?: CollectionOperationOptions) => {
    shouldMigrate = false;

    if (options?.session) return command(SqlFor.createCollection(), options);
    else return command(SqlFor.createCollection());
  };

  const ensureCollectionCreated = (options?: CollectionOperationOptions) => {
    if (!shouldMigrate) {
      return Promise.resolve();
    }

    return createCollection(options);
  };

  const collection = {
    dbName: db.databaseName,
    collectionName,
    createCollection: async (options?: CollectionOperationOptions) => {
      await createCollection(options);
    },
    insertOne: async (
      document: OptionalUnlessRequiredIdAndVersion<T>,
      options?: InsertOneOptions,
    ): Promise<PongoInsertOneResult> => {
      await ensureCollectionCreated(options);

      const _id = (document._id as string | undefined | null) ?? uuid();
      const _version = document._version ?? 1n;

      const result = await command(
        SqlFor.insertOne({
          ...document,
          _id,
          _version,
        } as OptionalUnlessRequiredIdAndVersion<T>),
        options,
      );

      const successful = (result.rowCount ?? 0) > 0;

      return operationResult<PongoInsertOneResult>(
        {
          successful,
          insertedId: successful ? _id : null,
        },
        { operationName: 'insertOne', collectionName, errors },
      );
    },
    insertMany: async (
      documents: OptionalUnlessRequiredIdAndVersion<T>[],
      options?: InsertManyOptions,
    ): Promise<PongoInsertManyResult> => {
      await ensureCollectionCreated(options);

      const rows = documents.map((doc) => ({
        ...doc,
        _id: (doc._id as string | undefined | null) ?? uuid(),
        _version: doc._version ?? 1n,
      }));

      const result = await command(
        SqlFor.insertMany(rows as OptionalUnlessRequiredIdAndVersion<T>[]),
        options,
      );

      return operationResult<PongoInsertManyResult>(
        {
          successful: result.rowCount === rows.length,
          insertedCount: result.rowCount ?? 0,
          insertedIds: result.rows.map((d) => d._id as string),
        },
        { operationName: 'insertMany', collectionName, errors },
      );
    },
    updateOne: async (
      filter: PongoFilter<T>,
      update: PongoUpdate<T>,
      options?: UpdateOneOptions,
    ): Promise<PongoUpdateResult> => {
      await ensureCollectionCreated(options);

      const result = await command<UpdateSqlResult>(
        SqlFor.updateOne(filter, update, options),
        options,
      );

      return operationResult<PongoUpdateResult>(
        {
          successful: result.rows[0]!.modified! === result.rows[0]!.matched!,
          modifiedCount: result.rows[0]!.modified!,
          matchedCount: result.rows[0]!.matched!,
        },
        { operationName: 'updateOne', collectionName, errors },
      );
    },
    upsertOne: async (
      filter: PongoFilter<T>,
      update: PongoUpdate<T>,
      options?: UpsertOneOptions,
    ): Promise<PongoUpdateResult> => {
      await ensureCollectionCreated(options);

      const result = await command<UpdateSqlResult>(
        SqlFor.upsertOne(filter, update, options),
        options,
      );

      return operationResult<PongoUpdateResult>(
        {
          successful: result.rows[0]!.modified! === 1,
          modifiedCount: result.rows[0]!.modified!,
          matchedCount: result.rows[0]!.matched!,
        },
        { operationName: 'upsertOne', collectionName, errors },
      );
    },
    replaceOne: async (
      filter: PongoFilter<T>,
      document: WithoutId<T>,
      options?: ReplaceOneOptions,
    ): Promise<PongoUpdateResult> => {
      await ensureCollectionCreated(options);

      const result = await command<UpdateSqlResult>(
        SqlFor.replaceOne(filter, document, options),
        options,
      );
      return operationResult<PongoUpdateResult>(
        {
          successful: result.rows[0]!.modified! > 0,
          modifiedCount: result.rows[0]!.modified!,
          matchedCount: result.rows[0]!.matched!,
        },
        { operationName: 'replaceOne', collectionName, errors },
      );
    },
    updateMany: async (
      filter: PongoFilter<T>,
      update: PongoUpdate<T>,
      options?: UpdateManyOptions,
    ): Promise<PongoUpdateResult> => {
      await ensureCollectionCreated(options);

      const result = await command(SqlFor.updateMany(filter, update), options);

      return operationResult<PongoUpdateResult>(
        {
          successful: true,
          modifiedCount: result.rowCount ?? 0,
          matchedCount: result.rowCount ?? 0,
        },
        { operationName: 'updateMany', collectionName, errors },
      );
    },
    deleteOne: async (
      filter?: PongoFilter<T>,
      options?: DeleteOneOptions,
    ): Promise<PongoDeleteResult> => {
      await ensureCollectionCreated(options);

      const result = await command<DeleteSqlResult>(
        SqlFor.deleteOne(filter ?? {}, options),
        options,
      );
      return operationResult<PongoDeleteResult>(
        {
          successful: result.rows[0]!.deleted! > 0,
          deletedCount: result.rows[0]!.deleted!,
          matchedCount: result.rows[0]!.matched!,
        },
        { operationName: 'deleteOne', collectionName, errors },
      );
    },
    deleteMany: async (
      filter?: PongoFilter<T>,
      options?: DeleteManyOptions,
    ): Promise<PongoDeleteResult> => {
      await ensureCollectionCreated(options);

      const result = await command(SqlFor.deleteMany(filter ?? {}), options);

      return operationResult<PongoDeleteResult>(
        {
          successful: (result.rowCount ?? 0) > 0,
          deletedCount: result.rowCount ?? 0,
          matchedCount: result.rowCount ?? 0,
        },
        { operationName: 'deleteMany', collectionName, errors },
      );
    },
    findOne: async (
      filter?: PongoFilter<T>,
      options?: CollectionOperationOptions,
    ): Promise<T | null> => {
      await ensureCollectionCreated(options);

      const result = await query(SqlFor.findOne(filter ?? {}), options);
      return (result.rows[0]?.data ?? null) as T | null;
    },
    findOneAndDelete: async (
      filter: PongoFilter<T>,
      options?: DeleteOneOptions,
    ): Promise<T | null> => {
      await ensureCollectionCreated(options);

      const existingDoc = await collection.findOne(filter, options);

      if (existingDoc === null) return null;

      await collection.deleteOne(filter, options);
      return existingDoc;
    },
    findOneAndReplace: async (
      filter: PongoFilter<T>,
      replacement: WithoutId<T>,
      options?: ReplaceOneOptions,
    ): Promise<T | null> => {
      await ensureCollectionCreated(options);

      const existingDoc = await collection.findOne(filter, options);

      if (existingDoc === null) return null;

      await collection.replaceOne(filter, replacement, options);

      return existingDoc;
    },
    findOneAndUpdate: async (
      filter: PongoFilter<T>,
      update: PongoUpdate<T>,
      options?: UpdateOneOptions,
    ): Promise<T | null> => {
      await ensureCollectionCreated(options);

      const existingDoc = await collection.findOne(filter, options);

      if (existingDoc === null) return null;

      await collection.updateOne(filter, update, options);

      return existingDoc;
    },
    handle: async (
      id: string,
      handle: DocumentHandler<T>,
      options?: CollectionOperationOptions,
    ): Promise<T | null> => {
      await ensureCollectionCreated(options);

      const byId: PongoFilter<T> = { _id: id };

      const existing = await collection.findOne(byId, options);

      const result = await handle(existing);

      if (!existing && result) {
        const newDoc = { ...result, _id: id };
        await collection.insertOne(
          { ...newDoc, _id: id } as OptionalUnlessRequiredIdAndVersion<T>,
          options,
        );
        return newDoc;
      }

      if (existing && !result) {
        await collection.deleteOne(byId, options);
        return null;
      }

      if (existing && result)
        await collection.replaceOne(byId, result, options);

      return result;
    },
    find: async (
      filter?: PongoFilter<T>,
      options?: CollectionOperationOptions,
    ): Promise<T[]> => {
      await ensureCollectionCreated(options);

      const result = await query(SqlFor.find(filter ?? {}));
      return result.rows.map((row) => row.data as T);
    },
    countDocuments: async (
      filter?: PongoFilter<T>,
      options?: CollectionOperationOptions,
    ): Promise<number> => {
      await ensureCollectionCreated(options);

      const { count } = await single(
        query<{ count: number }>(SqlFor.countDocuments(filter ?? {})),
      );
      return count;
    },
    drop: async (options?: CollectionOperationOptions): Promise<boolean> => {
      await ensureCollectionCreated(options);
      const result = await command(SqlFor.drop());
      return (result?.rowCount ?? 0) > 0;
    },
    rename: async (
      newName: string,
      options?: CollectionOperationOptions,
    ): Promise<PongoCollection<T>> => {
      await ensureCollectionCreated(options);
      await command(SqlFor.rename(newName));
      collectionName = newName;
      return collection;
    },
    schema: {
      get component(): SchemaComponent {
        return schemaComponent('pongo:schema_component:collection', {
          migrations: SqlFor.migrations,
        });
      },
      migrate: () => runPostgreSQLMigrations(pool, SqlFor.migrations()), // TODO: This needs to change to support more connectors
    },
  };

  return collection;
};

export const pongoCollectionSchemaComponent = (collectionName: string) =>
  schemaComponent('pongo:schema_component:collection', {
    migrations: () => pongoCollectionPostgreSQLMigrations(collectionName), // TODO: This needs to change to support more connectors
  });

export type PongoCollectionSQLBuilder = {
  migrations: () => SQLMigration[];
  createCollection: () => SQL;
  insertOne: <T>(document: OptionalUnlessRequiredIdAndVersion<T>) => SQL;
  insertMany: <T>(documents: OptionalUnlessRequiredIdAndVersion<T>[]) => SQL;
  updateOne: <T>(
    filter: PongoFilter<T>,
    update: PongoUpdate<T>,
    options?: UpdateOneOptions,
  ) => SQL;
  upsertOne: <T>(
    filter: PongoFilter<T>,
    update: PongoUpdate<T>,
    options?: UpsertOneOptions,
  ) => SQL;
  replaceOne: <T>(
    filter: PongoFilter<T>,
    document: WithoutId<T>,
    options?: ReplaceOneOptions,
  ) => SQL;
  updateMany: <T>(filter: PongoFilter<T>, update: PongoUpdate<T>) => SQL;
  deleteOne: <T>(filter: PongoFilter<T>, options?: DeleteOneOptions) => SQL;
  deleteMany: <T>(filter: PongoFilter<T>) => SQL;
  findOne: <T>(filter: PongoFilter<T>) => SQL;
  find: <T>(filter: PongoFilter<T>) => SQL;
  countDocuments: <T>(filter: PongoFilter<T>) => SQL;
  rename: (newName: string) => SQL;
  drop: () => SQL;
};

type UpdateSqlResult = {
  matched: number | null;
  modified: number | null;
};

type DeleteSqlResult = {
  matched: number | null;
  deleted: number | null;
};
