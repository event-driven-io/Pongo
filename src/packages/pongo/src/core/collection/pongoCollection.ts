import type { JSONSerializer, SQL } from '@event-driven-io/dumbo';
import {
  mapColumnToBigint,
  mapColumnToJSON,
  runSQLMigrations,
  single,
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
import type { PongoCollectionSchemaComponent, PongoDocumentCacheKey } from '..';
import {
  deepEquals,
  expectedVersionValue,
  getIdsFromIdOnlyFilter,
  idFromFilter,
  operationResult,
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
  type PongoMigrationOptions,
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
import { pongoCache, type CacheConfig, type PongoCache } from '../cache';

export type PongoCollectionOptions<
  T extends PongoDocument = PongoDocument,
  DriverType extends DatabaseDriverType = DatabaseDriverType,
  Payload extends PongoDocument = T,
> = {
  db: PongoDb<DriverType>;
  collectionName: string;
  pool: Dumbo<DatabaseDriverType>;
  schemaComponent: PongoCollectionSchemaComponent;
  schema?: {
    autoMigration?: MigrationStyle;
    versioning?: {
      upcast?: (doc: Payload) => T;
      downcast?: (doc: T) => Payload;
    };
  };
  errors?: { throwOnOperationFailures?: boolean };
  serializer: JSONSerializer;
  cache?: CacheConfig | 'disabled' | PongoCache | undefined;
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

export const pongoCollection = <
  T extends PongoDocument,
  DriverType extends DatabaseDriverType = DatabaseDriverType,
  Payload extends PongoDocument = T,
>({
  db,
  collectionName,
  pool,
  schemaComponent,
  schema,
  errors,
  serializer,
  cache: cacheOptions,
}: PongoCollectionOptions<T, DriverType, Payload>): PongoCollection<T> => {
  const SqlFor = schemaComponent.sqlBuilder;
  const sqlExecutor = pool.execute;

  const cache = pongoCache(cacheOptions);

  const columnMapping = {
    mapping: {
      ...mapColumnToJSON('data', serializer),
      ...mapColumnToBigint('_version'),
    } satisfies SQLQueryResultColumnMapping,
  };

  const command = async <Result extends QueryResultRow = QueryResultRow>(
    sql: SQL,
    options?: CollectionOperationOptions,
  ) =>
    (
      await transactionExecutorOrDefault(db, options, sqlExecutor)
    ).command<Result>(sql, columnMapping);

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

  const upcast =
    schema?.versioning?.upcast ?? ((doc: Payload) => doc as unknown as T);

  const downcast =
    schema?.versioning?.downcast ?? ((doc: T) => doc as unknown as Payload);

  const rowToDoc = (row: { data: T; _version: bigint }): WithIdAndVersion<T> =>
    upcast({
      ...row.data,
      _version: row._version,
    } as unknown as Payload) as WithIdAndVersion<T>;

  const findOneFromDb = async (
    filter: PongoFilter<T>,
    options?: CollectionOperationOptions,
  ): Promise<WithIdAndVersion<T> | null> => {
    const result = await query<{ data: T; _version: bigint }>(
      SqlFor.findOne(filter),
      options,
    );
    const row = result.rows[0];
    return row ? rowToDoc(row) : null;
  };

  const cacheKey = (id: string): PongoDocumentCacheKey =>
    `${db.databaseName}:${collectionName}:${id}`;

  const txCacheFor = (options: CollectionOperationOptions | undefined) =>
    options?.session?.transaction?.cache ?? null;

  const resolveFromCache = async (
    key: PongoDocumentCacheKey,
    options: CollectionOperationOptions | undefined,
  ): Promise<T | null | undefined> => {
    const txCache = txCacheFor(options);
    if (txCache) {
      const cached = await txCache.get<T>(key);
      if (cached !== undefined) return cached;
    }
    return cache.get<T>(key);
  };

  const findManyFromCache = async (
    keys: PongoDocumentCacheKey[],
    options: CollectionOperationOptions | undefined,
  ): Promise<(T | null | undefined)[]> => {
    const txCache = txCacheFor(options);

    if (!txCache) {
      return cache.getMany<T>(keys);
    }

    const txResults = await txCache.getMany<T>(keys);
    const mainResults = await cache.getMany<T>(keys);
    return keys.map((_, i) =>
      txResults[i] !== undefined ? txResults[i] : mainResults[i],
    );
  };

  const findManyByIds = async (
    ids: string[],
    options: FindOptions | undefined,
  ): Promise<WithIdAndVersion<T>[]> => {
    const cachedResults = await findManyFromCache(ids.map(cacheKey), options);

    const hits = cachedResults.filter((c) => c !== undefined);
    const missIds = ids.filter((_, i) => cachedResults[i] === undefined);

    const foundDocs = hits
      .filter((c) => c !== null)
      .map(
        (c) => upcast({ ...c } as unknown as Payload) as WithIdAndVersion<T>,
      );

    if (missIds.length === 0) return foundDocs;

    const dbResult = await query<{ data: T; _version: bigint }>(
      SqlFor.find(
        { _id: { $in: missIds } } as unknown as PongoFilter<T>,
        options,
      ),
    );
    const dbDocs = dbResult.rows.map(rowToDoc);

    const dbDocsById = new Map(
      dbDocs.map((d) => [(d as PongoDocument)['_id'] as string, d]),
    );
    await cacheSetMany(
      missIds.map((id) => ({
        key: cacheKey(id),
        value: (dbDocsById.get(id) as PongoDocument) ?? null,
      })),
      options,
    );

    return [...foundDocs, ...dbDocs];
  };

  const cacheSet = (
    key: PongoDocumentCacheKey,
    value: PongoDocument | null,
    options: CollectionOperationOptions | undefined,
  ) => {
    const txCache = txCacheFor(options);
    if (txCache) return txCache.set(key, value, { mainCache: cache });
    return cache.set(key, value);
  };

  const cacheSetMany = (
    entries: { key: PongoDocumentCacheKey; value: PongoDocument | null }[],
    options: CollectionOperationOptions | undefined,
  ) => {
    const txCache = txCacheFor(options);
    if (txCache) return txCache.setMany(entries, { mainCache: cache });
    return cache.setMany(entries);
  };

  const cacheDelete = (
    key: PongoDocumentCacheKey,
    options: CollectionOperationOptions | undefined,
  ) => {
    const txCache = txCacheFor(options);
    if (txCache) return txCache.delete(key, { mainCache: cache });
    return cache.delete(key);
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
      const downcasted = downcast(document as T);

      const result = await command(
        SqlFor.insertOne({
          ...downcasted,
          _id,
          _version,
        } as unknown as OptionalUnlessRequiredIdAndVersion<Payload>),
        options,
      );

      const successful = (result.rowCount ?? 0) > 0;

      if (successful && !options?.skipCache) {
        const doc = { ...document, _id, _version } as PongoDocument;
        await cacheSet(cacheKey(_id), doc, options);
      }

      return operationResult<PongoInsertOneResult>(
        {
          successful,
          insertedId: successful ? _id : null,
          nextExpectedVersion: _version,
        },
        { operationName: 'insertOne', collectionName, serializer, errors },
      );
    },
    insertMany: async (
      documents: OptionalUnlessRequiredIdAndVersion<T>[],
      options?: InsertManyOptions,
    ): Promise<PongoInsertManyResult> => {
      await ensureCollectionCreated(options);

      const rows = documents.map((doc) => {
        const downcasted = downcast(doc as T);
        return {
          ...downcasted,
          _id: (doc._id as string | undefined | null) ?? uuid(),
          _version: doc._version ?? 1n,
        };
      });

      const result = await command(
        SqlFor.insertMany(
          rows as unknown as OptionalUnlessRequiredIdAndVersion<Payload>[],
        ),
        options,
      );

      if (!options?.skipCache) {
        await cacheSetMany(
          rows.map((r) => ({
            key: cacheKey(r._id),
            value: r as PongoDocument,
          })),
          options,
        );
      }

      return operationResult<PongoInsertManyResult>(
        {
          successful: result.rowCount === rows.length,
          insertedCount: result.rowCount ?? 0,
          insertedIds: result.rows.map((d) => d._id as string),
        },
        { operationName: 'insertMany', collectionName, serializer, errors },
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

      const opResult = operationResult<PongoUpdateResult>(
        {
          successful:
            result.rows.length > 0 &&
            result.rows[0]!.modified === result.rows[0]!.matched,
          modifiedCount: Number(result.rows[0]?.modified ?? 0),
          matchedCount: Number(result.rows[0]?.matched ?? 0),
          nextExpectedVersion: BigInt(result.rows[0]?.version ?? 0n),
        },
        { operationName: 'updateOne', collectionName, serializer, errors },
      );

      if (opResult.successful && !options?.skipCache) {
        const id = idFromFilter(filter);
        if (id) {
          await cacheDelete(cacheKey(id), options);
        }
      }

      return opResult;
    },
    replaceOne: async (
      filter: PongoFilter<T>,
      document: WithoutId<T>,
      options?: ReplaceOneOptions,
    ): Promise<PongoUpdateResult> => {
      await ensureCollectionCreated(options);

      const downcasted = downcast(document as T) as unknown as WithoutId<T>;

      const result = await command<UpdateSqlResult>(
        SqlFor.replaceOne(filter, downcasted, options),
        options,
      );

      const opResult = operationResult<PongoUpdateResult>(
        {
          successful: result.rows.length > 0 && result.rows[0]!.modified > 0,
          modifiedCount: Number(result.rows[0]?.modified ?? 0),
          matchedCount: Number(result.rows[0]?.matched ?? 0),
          nextExpectedVersion: BigInt(result.rows[0]?.version ?? 0n),
        },
        { operationName: 'replaceOne', collectionName, serializer, errors },
      );

      if (opResult.successful && !options?.skipCache) {
        const id = idFromFilter(filter);
        if (id) {
          const newVersion = opResult.nextExpectedVersion;
          await cacheSet(
            cacheKey(id),
            {
              ...(downcasted as PongoDocument),
              _id: id,
              _version: newVersion,
            },
            options,
          );
        }
      }

      return opResult;
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
        { operationName: 'updateMany', collectionName, serializer, errors },
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

      const opResult = operationResult<PongoDeleteResult>(
        {
          successful: result.rows.length > 0 && result.rows[0]!.deleted! > 0,
          deletedCount: Number(result.rows[0]?.deleted ?? 0),
          matchedCount: Number(result.rows[0]?.matched ?? 0),
        },
        { operationName: 'deleteOne', collectionName, serializer, errors },
      );

      if (opResult.successful && !options?.skipCache && filter) {
        const id = idFromFilter(filter);
        if (id) await cacheSet(cacheKey(id), null, options);
      }

      return opResult;
    },
    deleteMany: async (
      filter?: PongoFilter<T>,
      options?: DeleteManyOptions,
    ): Promise<PongoDeleteResult> => {
      await ensureCollectionCreated(options);

      const result = await command(SqlFor.deleteMany(filter ?? {}), options);

      if (!options?.skipCache && filter) {
        const ids = getIdsFromIdOnlyFilter(filter);
        if (ids)
          await cacheSetMany(
            ids.map((id) => ({ key: cacheKey(id), value: null })),
            options,
          );
      }

      return operationResult<PongoDeleteResult>(
        {
          successful: (result.rowCount ?? 0) > 0,
          deletedCount: result.rowCount ?? 0,
          matchedCount: result.rowCount ?? 0,
        },
        { operationName: 'deleteMany', collectionName, serializer, errors },
      );
    },
    findOne: async (
      filter?: PongoFilter<T>,
      options?: CollectionOperationOptions,
    ): Promise<WithIdAndVersion<T> | null> => {
      await ensureCollectionCreated(options);

      const id = filter && !options?.skipCache ? idFromFilter(filter) : null;

      if (id) {
        const cached = await resolveFromCache(cacheKey(id), options);
        if (cached !== undefined)
          return cached !== null
            ? (upcast({
                ...cached,
              } as unknown as Payload) as WithIdAndVersion<T>)
            : null;
        const doc = await findOneFromDb(filter!, options);
        await cacheSet(cacheKey(id), doc as PongoDocument | null, options);
        return doc;
      }

      return findOneFromDb(filter ?? {}, options);
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
          { operationName: 'handle', collectionName, serializer, errors },
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
          { operationName: 'handle', collectionName, serializer, errors },
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
        if (!insertResult.successful) {
          await cacheDelete(cacheKey(id), options);
        }
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
        if (!deleteResult.successful) {
          await cacheDelete(cacheKey(id), options);
        }
        return { ...deleteResult, document: null };
      }

      if (existing && result) {
        const replaceResult = await collection.replaceOne(byId, result, {
          ...operationOptions,
          expectedVersion: expectedVersion ?? 'DOCUMENT_EXISTS',
        });
        if (!replaceResult.successful) {
          await cacheDelete(cacheKey(id), options);
        }
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
        { operationName: 'handle', collectionName, serializer, errors },
      );
    },
    find: async (
      filter?: PongoFilter<T>,
      options?: FindOptions,
    ): Promise<WithIdAndVersion<T>[]> => {
      await ensureCollectionCreated(options);

      if (!options?.skipCache && filter) {
        const ids = getIdsFromIdOnlyFilter(filter);
        if (ids && ids.length > 0) return findManyByIds(ids, options);
      }

      const result = await query<{ data: T; _version: bigint }>(
        SqlFor.find(filter ?? {}, options),
      );
      return result.rows.map(rowToDoc);
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
    close: () => cache.close(),

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
      migrate: (options?: PongoMigrationOptions) =>
        runSQLMigrations(pool, schemaComponent.migrations, options),
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
