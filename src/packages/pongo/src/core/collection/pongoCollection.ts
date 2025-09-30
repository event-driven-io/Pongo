import {
  mapColumnToJSON,
  runSQLMigrations,
  single,
  SQL,
  type DatabaseDriverType,
  type DatabaseTransaction,
  type Dumbo,
  type MigrationStyle,
  type QueryResult,
  type QueryResultRow,
  type SQLExecutor,
  type SQLQueryResultColumnMapping,
} from '@event-driven-io/dumbo';
import { v7 as uuid } from 'uuid';
import {
  deepEquals,
  expectedVersionValue,
  operationResult,
  PongoCollectionSchemaComponent,
  type CollectionOperationOptions,
  type DeleteManyOptions,
  type DeleteOneOptions,
  type DocumentHandler,
  type FindOptions,
  type HandleOptions,
  type InsertManyOptions,
  type InsertOneOptions,
  type OptionalUnlessRequiredIdAndVersion,
  type PongoCollection,
  type PongoDb,
  type PongoDeleteResult,
  type PongoDocument,
  type PongoFilter,
  type PongoHandleResult,
  type PongoInsertManyResult,
  type PongoInsertOneResult,
  type PongoUpdate,
  type PongoUpdateManyResult,
  type PongoUpdateResult,
  type ReplaceOneOptions,
  type UpdateManyOptions,
  type UpdateOneOptions,
  type WithIdAndVersion,
  type WithoutId,
  type WithVersion,
} from '..';

export type PongoCollectionOptions<
  DriverType extends DatabaseDriverType = DatabaseDriverType,
> = {
  db: PongoDb<DriverType>;
  collectionName: string;
  pool: Dumbo<DatabaseDriverType>;
  schemaComponent: PongoCollectionSchemaComponent;
  schema?: { autoMigration?: MigrationStyle };
  errors?: { throwOnOperationFailures?: boolean };
};

const enlistIntoTransactionIfActive = async <
  DriverType extends DatabaseDriverType = DatabaseDriverType,
>(
  db: PongoDb<DriverType>,
  options: CollectionOperationOptions | undefined,
): Promise<DatabaseTransaction | null> => {
  const transaction = options?.session?.transaction;

  if (!transaction || !transaction.isActive) return null;

  return await transaction.enlistDatabase(db);
};

export const transactionExecutorOrDefault = async <
  DriverType extends DatabaseDriverType = DatabaseDriverType,
>(
  db: PongoDb<DriverType>,
  options: CollectionOperationOptions | undefined,
  defaultSqlExecutor: SQLExecutor,
): Promise<SQLExecutor> => {
  const existingTransaction = await enlistIntoTransactionIfActive(db, options);
  return existingTransaction?.execute ?? defaultSqlExecutor;
};

const columnMapping = {
  mapping: {
    ...mapColumnToJSON('data'),
    //...mapColumnToJSON('metadata'),
    //...mapColumnToBigint('_version'),
  } satisfies SQLQueryResultColumnMapping,
};

export const pongoCollection = <
  T extends PongoDocument,
  DriverType extends DatabaseDriverType = DatabaseDriverType,
>({
  db,
  collectionName,
  pool,
  schemaComponent,
  schema,
  errors,
}: PongoCollectionOptions<DriverType>): PongoCollection<T> => {
  const SqlFor = schemaComponent.sqlBuilder;
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
      columnMapping,
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
          nextExpectedVersion: _version,
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
          successful:
            result.rows.length > 0 &&
            result.rows[0]!.modified === result.rows[0]!.matched,
          modifiedCount: Number(result.rows[0]?.modified ?? 0),
          matchedCount: Number(result.rows[0]?.matched ?? 0),
          nextExpectedVersion: BigInt(result.rows[0]?.version ?? 0n),
        },
        { operationName: 'updateOne', collectionName, errors },
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
          successful: result.rows.length > 0 && result.rows[0]!.modified > 0,
          modifiedCount: Number(result.rows[0]?.modified ?? 0),
          matchedCount: Number(result.rows[0]?.matched ?? 0),
          nextExpectedVersion: BigInt(result.rows[0]?.version ?? 0n),
        },
        { operationName: 'replaceOne', collectionName, errors },
      );
    },
    updateMany: async (
      filter: PongoFilter<T>,
      update: PongoUpdate<T>,
      options?: UpdateManyOptions,
    ): Promise<PongoUpdateManyResult> => {
      await ensureCollectionCreated(options);

      const result = await command(SqlFor.updateMany(filter, update), options);

      return operationResult<PongoUpdateManyResult>(
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
          successful: result.rows.length > 0 && result.rows[0]!.deleted! > 0,
          deletedCount: Number(result.rows[0]?.deleted ?? 0),
          matchedCount: Number(result.rows[0]?.matched ?? 0),
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
    ): Promise<WithIdAndVersion<T> | null> => {
      await ensureCollectionCreated(options);

      const result = await query(SqlFor.findOne(filter ?? {}), options);
      return (result.rows[0]?.data ?? null) as WithIdAndVersion<T> | null;
    },
    findOneAndDelete: async (
      filter: PongoFilter<T>,
      options?: DeleteOneOptions,
    ): Promise<WithIdAndVersion<T> | null> => {
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
    ): Promise<WithIdAndVersion<T> | null> => {
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
    ): Promise<WithIdAndVersion<T> | null> => {
      await ensureCollectionCreated(options);

      const existingDoc = await collection.findOne(filter, options);

      if (existingDoc === null) return null;

      await collection.updateOne(filter, update, options);

      return existingDoc;
    },
    handle: async (
      id: string,
      handle: DocumentHandler<T>,
      options?: HandleOptions,
    ): Promise<PongoHandleResult<T>> => {
      const { expectedVersion: version, ...operationOptions } = options ?? {};
      await ensureCollectionCreated(options);

      const byId: PongoFilter<T> = { _id: id };

      const existing = (await collection.findOne(
        byId,
        options,
      )) as WithVersion<T> | null;

      const expectedVersion = expectedVersionValue(version);

      if (
        (existing == null && version === 'DOCUMENT_EXISTS') ||
        (existing == null && expectedVersion != null) ||
        (existing != null && version === 'DOCUMENT_DOES_NOT_EXIST') ||
        (existing != null &&
          expectedVersion !== null &&
          existing._version !== expectedVersion)
      ) {
        return operationResult<PongoHandleResult<T>>(
          {
            successful: false,
            document: existing as T,
          },
          { operationName: 'handle', collectionName, errors },
        );
      }

      const result = await handle(
        existing !== null ? ({ ...existing } as T) : null,
      );

      if (deepEquals(existing as T | null, result))
        return operationResult<PongoHandleResult<T>>(
          {
            successful: true,
            document: existing as T | null,
          },
          { operationName: 'handle', collectionName, errors },
        );

      if (!existing && result) {
        const newDoc = { ...result, _id: id };
        const insertResult = await collection.insertOne(
          { ...newDoc, _id: id } as OptionalUnlessRequiredIdAndVersion<T>,
          {
            ...operationOptions,
            expectedVersion: 'DOCUMENT_DOES_NOT_EXIST',
          },
        );
        return {
          ...insertResult,
          document: {
            ...newDoc,
            _version: insertResult.nextExpectedVersion,
          } as T,
        };
      }

      if (existing && !result) {
        const deleteResult = await collection.deleteOne(byId, {
          ...operationOptions,
          expectedVersion: expectedVersion ?? 'DOCUMENT_EXISTS',
        });
        return { ...deleteResult, document: null };
      }

      if (existing && result) {
        const replaceResult = await collection.replaceOne(byId, result, {
          ...operationOptions,
          expectedVersion: expectedVersion ?? 'DOCUMENT_EXISTS',
        });
        return {
          ...replaceResult,
          document: {
            ...result,
            _version: replaceResult.nextExpectedVersion,
          } as T,
        };
      }

      return operationResult<PongoHandleResult<T>>(
        {
          successful: true,
          document: existing as T,
        },
        { operationName: 'handle', collectionName, errors },
      );
    },
    find: async (
      filter?: PongoFilter<T>,
      options?: FindOptions,
    ): Promise<WithIdAndVersion<T>[]> => {
      await ensureCollectionCreated(options);

      const result = await query(SqlFor.find(filter ?? {}, options));
      return result.rows.map((row) => row.data as WithIdAndVersion<T>);
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

    sql: {
      async query<Result extends QueryResultRow = QueryResultRow>(
        sql: SQL,
        options?: CollectionOperationOptions,
      ): Promise<Result[]> {
        await ensureCollectionCreated(options);

        const result = await query<Result>(sql, options);
        return result.rows;
      },
      async command<Result extends QueryResultRow = QueryResultRow>(
        sql: SQL,
        options?: CollectionOperationOptions,
      ): Promise<QueryResult<Result>> {
        await ensureCollectionCreated(options);

        return command(sql, options);
      },
    },
    schema: {
      component: schemaComponent,
      migrate: () => runSQLMigrations(pool, schemaComponent.migrations),
    },
  };

  return collection;
};

type UpdateSqlResult = {
  matched: bigint;
  modified: bigint;
  version: bigint;
};

type DeleteSqlResult = {
  matched: bigint | null;
  deleted: bigint | null;
};
