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
import type {
  PongoCollectionSchemaComponent,
  PongoDocumentCacheKey,
  WithId,
} from '..';
import {
  getIdsFromIdOnlyFilter,
  idFromFilter,
  NO_CONCURRENCY_CHECK,
  operationResult,
  type CollectionOperationOptions,
  type DeleteManyOptions,
  type DeleteOneOptions,
  type FindOptions,
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
  type PongoMigrationOptions,
  type PongoReplaceManyResult,
  type PongoUpdate,
  type PongoUpdateManyResult,
  type PongoUpdateResult,
  type ReplaceManyOptions,
  type ReplaceOneOptions,
  type UpdateManyOptions,
  type UpdateOneOptions,
  type WithIdAndVersion,
  type WithoutId,
} from '..';
import { pongoCache, type CacheConfig, type PongoCache } from '../cache';
import { DocumentCommandHandler } from './handle';

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

  const toStored = (
    document: WithIdAndVersion<T>,
  ): WithIdAndVersion<Payload> => ({
    ...downcast(document),
    _id: document._id,
    _version: document._version,
  });

  const fromStored = (
    stored: WithIdAndVersion<Payload>,
  ): WithIdAndVersion<T> => ({
    ...upcast(stored),
    _id: stored._id,
    _version: stored._version,
  });

  const findOneStoredFromDb = async (
    filter: PongoFilter<T>,
    options?: CollectionOperationOptions,
  ): Promise<WithIdAndVersion<Payload> | null> => {
    const result = await query<{
      data: Payload;
      _id: string;
      _version: bigint;
    }>(SqlFor.findOne(filter), options);
    const row = result.rows[0];
    return row ? { ...row.data, _id: row._id, _version: row._version } : null;
  };

  const cacheKey = (id: string): PongoDocumentCacheKey =>
    `${db.databaseName}:${collectionName}:${id}`;

  const txCacheFor = (options: CollectionOperationOptions | undefined) =>
    options?.session?.transaction?.cache ?? null;

  const resolveFromCache = async (
    key: PongoDocumentCacheKey,
    options: CollectionOperationOptions | undefined,
  ): Promise<WithIdAndVersion<Payload> | null | undefined> => {
    const txCache = txCacheFor(options);
    if (txCache) {
      const cached = await txCache.get<WithIdAndVersion<Payload>>(key);
      if (cached !== undefined) return cached;
    }
    return cache.get<WithIdAndVersion<Payload>>(key);
  };

  const findManyFromCache = async (
    keys: PongoDocumentCacheKey[],
    options: CollectionOperationOptions | undefined,
  ): Promise<(WithIdAndVersion<Payload> | null | undefined)[]> => {
    const txCache = txCacheFor(options);

    if (!txCache) {
      return cache.getMany<WithIdAndVersion<Payload>>(keys);
    }

    const txResults = await txCache.getMany<WithIdAndVersion<Payload>>(keys);
    const mainResults = await cache.getMany<WithIdAndVersion<Payload>>(keys);
    return keys.map((_, i) =>
      txResults[i] !== undefined ? txResults[i] : mainResults[i],
    );
  };

  const fetchByIds = async (
    ids: string[],
    options: CollectionOperationOptions | undefined,
  ): Promise<(WithIdAndVersion<Payload> | null)[]> => {
    const cachedResults = await findManyFromCache(ids.map(cacheKey), options);

    const missIds = ids.filter((_, i) => cachedResults[i] === undefined);

    let dbDocsById = new Map<string, WithIdAndVersion<Payload>>();
    if (missIds.length > 0) {
      const dbResult = await query<{
        data: Payload;
        _id: string;
        _version: bigint;
      }>(
        SqlFor.find(
          { _id: { $in: missIds } } as unknown as PongoFilter<T>,
          options,
        ),
      );
      const dbDocs = dbResult.rows.map((row) => ({
        ...row.data,
        _id: row._id,
        _version: row._version,
      }));
      dbDocsById = new Map(dbDocs.map((d) => [d._id, d]));
      const leftovers = missIds.map(
        (id) => [id, dbDocsById.get(id) ?? null] as const,
      );
      await cacheSetMany(
        leftovers.map((d) => d[1]).filter((d) => d !== null),
        options,
      );
      await cacheDeleteMany(
        leftovers.filter(([, doc]) => doc === null).map(([id]) => id),
        options,
      );
    }

    return ids.map((id, i) => {
      const cached = cachedResults[i];
      if (cached !== undefined) return cached;
      return dbDocsById.get(id) ?? null;
    });
  };

  const findManyByIds = async (
    ids: string[],
    options: FindOptions | undefined,
  ): Promise<WithIdAndVersion<T>[]> => {
    const results = await fetchByIds(ids, options);
    return results.filter((doc) => doc !== null).map(fromStored);
  };

  const cacheSet = (
    value: WithIdAndVersion<Payload>,
    options: CollectionOperationOptions | undefined,
  ) => {
    const key = cacheKey(value._id);
    const txCache = txCacheFor(options);

    if (txCache) return txCache.set(key, value, { mainCache: cache });

    return cache.set(key, value);
  };

  const cacheSetMany = (
    documents: WithIdAndVersion<Payload>[],
    options: CollectionOperationOptions | undefined,
  ) => {
    const txCache = txCacheFor(options);
    const entries = documents.map((d) => ({ key: cacheKey(d._id), value: d }));

    if (txCache) return txCache.setMany(entries, { mainCache: cache });
    return cache.setMany(entries);
  };

  const cacheDelete = (
    id: string,
    options: CollectionOperationOptions | undefined,
  ) => {
    const txCache = txCacheFor(options);
    const key = cacheKey(id);

    if (txCache) return txCache.delete(key, { mainCache: cache });
    return cache.delete(key);
  };

  const cacheDeleteMany = (
    ids: string[],
    options: CollectionOperationOptions | undefined,
  ) => {
    const txCache = txCacheFor(options);
    const keys = ids.map(cacheKey);

    if (txCache) return txCache.deleteMany(keys, { mainCache: cache });
    return cache.deleteMany(keys);
  };

  const deleteManyByIds = async (
    ids: Array<{ _id: string; _version?: bigint }>,
    options?: CollectionOperationOptions,
  ): Promise<PongoDeleteResult & { deletedIds: Set<string> }> => {
    await ensureCollectionCreated(options);

    const result = await command<{ _id: string; deleted?: number }>(
      SqlFor.deleteManyByIds(ids),
      options,
    );

    const deletedIds = new Set(
      result.rows.filter((row) => (row.deleted ?? 1) > 0).map((row) => row._id),
    );

    if (!options?.skipCache) {
      await cacheDeleteMany([...deletedIds], options);
    }

    return operationResult<PongoDeleteResult & { deletedIds: Set<string> }>(
      {
        successful: deletedIds.size > 0,
        deletedCount: deletedIds.size,
        matchedCount: ids.length,
        deletedIds,
      },
      {
        operationName: 'deleteManyByIds',
        collectionName,
        serializer,
        errors,
      },
    );
  };

  const collection: PongoCollection<T> = {
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
      const stored = toStored({
        ...(document as T),
        _id,
        _version: _version,
      });

      if (options?.upsert) {
        const result = await command<UpsertSqlResult>(
          SqlFor.insertOrReplace([stored]),
          options,
        );

        const row = result.rows[0];
        const successful = row != null;
        const nextExpectedVersion = BigInt(row?.version ?? _version);

        if (successful && !options?.skipCache) {
          await cacheSet({ ...stored, _version: nextExpectedVersion }, options);
        }

        return operationResult<PongoInsertOneResult>(
          {
            successful,
            insertedId: successful ? _id : null,
            nextExpectedVersion,
          },
          { operationName: 'insertOne', collectionName, serializer, errors },
        );
      }

      const result = await command(
        SqlFor.insertOne(
          stored as unknown as OptionalUnlessRequiredIdAndVersion<Payload>,
        ),
        options,
      );

      const successful = (result.rowCount ?? 0) > 0;

      if (successful && !options?.skipCache) {
        await cacheSet(stored, options);
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

      const documentsWithMetadata = documents.map((doc) =>
        doc._id && doc._version
          ? (doc as WithIdAndVersion<T>)
          : ({
              ...doc,
              _id: doc._id ?? uuid(),
              _version: doc._version ?? 1n,
            } as WithIdAndVersion<T>),
      );

      const rows: WithIdAndVersion<Payload>[] = documentsWithMetadata.map((d) =>
        toStored(d),
      );

      if (options?.upsert) {
        const result = await command<UpsertSqlResult>(
          SqlFor.insertOrReplace(rows),
          options,
        );

        const writtenIds = result.rows.map((r) => r._id);
        const versions = new Map(
          result.rows.map((r) => [r._id, BigInt(r.version ?? 1n)]),
        );

        if (!options?.skipCache) {
          const writtenSet = new Set(writtenIds);
          await cacheSetMany(
            rows
              .filter((r) => writtenSet.has(r._id))
              .map((r) => ({ ...r, _version: versions.get(r._id) ?? 1n })),
            options,
          );
        }

        return operationResult<PongoInsertManyResult>(
          {
            successful: writtenIds.length === rows.length,
            insertedCount: writtenIds.length,
            insertedIds: writtenIds,
          },
          { operationName: 'insertMany', collectionName, serializer, errors },
        );
      }

      const result = await command(
        SqlFor.insertMany(
          rows as unknown as OptionalUnlessRequiredIdAndVersion<Payload>[],
        ),
        options,
      );

      if (!options?.skipCache) {
        const insertedIdSet = new Set(result.rows.map((d) => d._id as string));
        await cacheSetMany(
          rows.filter((r) => insertedIdSet.has(r._id)),
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
          upsertedId: null,
          upsertedCount: 0,
          nextExpectedVersion: BigInt(result.rows[0]?.version ?? 0n),
        },
        { operationName: 'updateOne', collectionName, serializer, errors },
      );

      if (opResult.successful && !options?.skipCache) {
        const id = idFromFilter(filter);
        if (id) await cacheDelete(id, options);
      }

      return opResult;
    },
    replaceOne: async (
      filter: PongoFilter<T>,
      document: WithoutId<T>,
      options?: ReplaceOneOptions,
    ): Promise<PongoUpdateResult> => {
      await ensureCollectionCreated(options);

      const noConcurrencyCheck =
        options?.expectedVersion === undefined ||
        options.expectedVersion === NO_CONCURRENCY_CHECK;

      if (options?.upsert && noConcurrencyCheck) {
        const _id = idFromFilter(filter) ?? uuid();
        const stored = toStored({
          ...(document as T),
          _id,
          _version: 1n,
        });

        const result = await command<UpsertSqlResult>(
          SqlFor.insertOrReplace([stored]),
          options,
        );

        const row = result.rows[0];
        const nextExpectedVersion = BigInt(row?.version ?? 1n);
        const inserted = row != null && nextExpectedVersion === 1n;

        const opResult = operationResult<PongoUpdateResult>(
          {
            successful: row != null,
            modifiedCount: row != null && !inserted ? 1 : 0,
            matchedCount: row != null && !inserted ? 1 : 0,
            upsertedId: inserted ? _id : null,
            upsertedCount: inserted ? 1 : 0,
            nextExpectedVersion,
          },
          { operationName: 'replaceOne', collectionName, serializer, errors },
        );

        if (row != null && !options?.skipCache) {
          await cacheSet({ ...stored, _version: nextExpectedVersion }, options);
        }

        return opResult;
      }

      const downcasted = downcast(document as T);

      const result = await command<UpdateSqlResult>(
        SqlFor.replaceOne(
          filter,
          downcasted as unknown as WithoutId<T>,
          options,
        ),
        options,
      );

      const opResult = operationResult<PongoUpdateResult>(
        {
          successful: result.rows.length > 0 && result.rows[0]!.modified > 0,
          modifiedCount: Number(result.rows[0]?.modified ?? 0),
          matchedCount: Number(result.rows[0]?.matched ?? 0),
          upsertedId: null,
          upsertedCount: 0,
          nextExpectedVersion: BigInt(result.rows[0]?.version ?? 0n),
        },
        { operationName: 'replaceOne', collectionName, serializer, errors },
      );

      if (opResult.successful && !options?.skipCache) {
        const _id = idFromFilter(filter);
        if (_id) {
          await cacheSet(
            toStored({
              ...document,
              _id,
              _version: opResult.nextExpectedVersion,
            } as WithIdAndVersion<T>),
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

      // TODO: add a similar filter checking if filter is not ids only
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
        if (id) await cacheDelete(id, options);
      }

      return opResult;
    },
    deleteMany: async (
      filter?: PongoFilter<T>,
      options?: DeleteManyOptions,
    ): Promise<PongoDeleteResult> => {
      const ids = filter ? getIdsFromIdOnlyFilter(filter) : null;
      if (ids)
        return deleteManyByIds(
          ids.map((id) => ({ _id: id })),
          options,
        );

      await ensureCollectionCreated(options);

      const result = await command(SqlFor.deleteMany(filter ?? {}), options);

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
          return cached !== null ? fromStored(cached) : null;

        const stored = await findOneStoredFromDb(filter!, options);
        if (stored) await cacheSet(stored, options);
        else await cacheDelete(id, options);
        return stored ? fromStored(stored) : null;
      }

      const stored = await findOneStoredFromDb(filter ?? {}, options);
      return stored ? fromStored(stored) : null;
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
    replaceMany: async (
      documents: Array<WithIdAndVersion<T>> | Array<WithId<T>>,
      options?: ReplaceManyOptions,
    ): Promise<PongoReplaceManyResult> => {
      await ensureCollectionCreated(options);

      const rows: (WithIdAndVersion<Payload> | WithId<Payload>)[] =
        documents.map((d) => toStored(d as WithIdAndVersion<T>));

      if (options?.upsert) {
        const versioned = documents.map(
          (d) => '_version' in d && d._version !== undefined,
        );
        const hasVersions = versioned.some((v) => v);
        const allVersioned = versioned.every((v) => v);

        if (hasVersions && !allVersioned)
          throw new Error(
            'replaceMany with upsert cannot mix documents with and without _version in a single batch',
          );

        if (!hasVersions) {
          const result = await command<UpsertSqlResult>(
            SqlFor.insertOrReplace(rows),
            options,
          );

          const writtenIds = result.rows.map((row) => row._id);
          const versions = new Map<string, bigint>(
            result.rows.map((row) => [row._id, BigInt(row.version ?? 1n)]),
          );
          const conflictIds = documents
            .map((d) => d._id)
            .filter((id) => !writtenIds.includes(id));

          if (!options?.skipCache) {
            const writtenSet = new Set(writtenIds);
            const cacheEntries = rows
              .filter((r) => writtenSet.has(r._id))
              .map((r) => ({ ...r, _version: versions.get(r._id) ?? 1n }));
            if (cacheEntries.length > 0)
              await cacheSetMany(cacheEntries, options);
          }

          return operationResult<PongoReplaceManyResult>(
            {
              successful: conflictIds.length === 0,
              modifiedCount: writtenIds.length,
              matchedCount: documents.length,
              modifiedIds: [...writtenIds],
              conflictIds: [...conflictIds],
              nextExpectedVersions: versions,
            },
            {
              operationName: 'replaceMany',
              collectionName,
              serializer,
              errors,
            },
          );
        }
      }

      const result = await command<{
        _id: string;
        version?: bigint | string | number;
      }>(SqlFor.replaceMany(rows), options);

      const modifiedIds = result.rows.map((row) => row._id);
      const conflictIds = documents
        .map((d) => d._id)
        .filter((id) => !modifiedIds.includes(id));
      const versions = new Map<string, bigint>(
        result.rows.map((row) => [row._id, BigInt(row.version ?? 1n)]),
      );

      if (!options?.skipCache) {
        const cacheEntries = rows
          .filter((r) => modifiedIds.includes(r._id))
          .map((r) => ({
            ...r,
            _version:
              versions.get(r._id) ?? (r._version as bigint | undefined) ?? 1n,
          }));
        if (cacheEntries.length > 0) await cacheSetMany(cacheEntries, options);

        if (conflictIds.length > 0)
          await cacheDeleteMany([...conflictIds], options);
      }

      return operationResult<PongoReplaceManyResult>(
        {
          successful: modifiedIds.length > 0 && conflictIds.length === 0,
          modifiedCount: modifiedIds.length,
          matchedCount: documents.length,
          modifiedIds: [...modifiedIds],
          conflictIds: [...conflictIds],
          nextExpectedVersions: versions,
        },
        { operationName: 'replaceMany', collectionName, serializer, errors },
      );
    },
    handle: DocumentCommandHandler<T>({
      collectionName,
      serializer,
      errors,
      storage: {
        ensureCollectionCreated,
        fetchByIds: (ids, options) =>
          fetchByIds(ids, options).then((rows) =>
            rows.map((stored) => (stored ? fromStored(stored) : null)),
          ),
        insertMany: (docs, options) => collection.insertMany(docs, options),
        replaceMany: (docs, options) => collection.replaceMany(docs, options),
        deleteManyByIds,
      },
    }),
    find: async (
      filter?: PongoFilter<T>,
      options?: FindOptions,
    ): Promise<WithIdAndVersion<T>[]> => {
      await ensureCollectionCreated(options);

      if (!options?.skipCache && filter) {
        const ids = getIdsFromIdOnlyFilter(filter);
        if (ids && ids.length > 0) return findManyByIds(ids, options);
      }

      const result = await query<{
        data: Payload;
        _id: string;
        _version: bigint;
      }>(SqlFor.find(filter ?? {}, options));
      return result.rows.map((row) =>
        fromStored({ ...row.data, _id: row._id, _version: row._version }),
      );
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

type UpsertSqlResult = {
  _id: string;
  version: bigint | string | number;
};

type DeleteSqlResult = {
  matched: bigint | null;
  deleted: bigint | null;
};
