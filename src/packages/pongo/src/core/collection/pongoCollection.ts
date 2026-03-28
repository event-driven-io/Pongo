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
  deepEquals,
  expectedVersionValue,
  getIdsFromIdOnlyFilter,
  idFromFilter,
  operationResult,
  type BatchHandleOptions,
  type CollectionOperationOptions,
  type DeleteManyOptions,
  type DeleteOneOptions,
  type DocumentHandler,
  type FindOptions,
  type HandleOptions,
  type InsertManyOptions,
  type InsertOneOptions,
  type OperationResult,
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

  const fetchByIds = async (
    ids: string[],
    options: CollectionOperationOptions | undefined,
  ): Promise<(WithIdAndVersion<T> | null)[]> => {
    const cachedResults = await findManyFromCache(ids.map(cacheKey), options);

    const missIds = ids.filter((_, i) => cachedResults[i] === undefined);

    let dbDocsById = new Map<string, WithIdAndVersion<T>>();
    if (missIds.length > 0) {
      const dbResult = await query<{ data: T; _version: bigint }>(
        SqlFor.find(
          { _id: { $in: missIds } } as unknown as PongoFilter<T>,
          options,
        ),
      );
      const dbDocs = dbResult.rows.map(rowToDoc);
      dbDocsById = new Map(
        dbDocs.map((d) => [(d as PongoDocument)['_id'] as string, d]),
      );
      await cacheSetMany(
        missIds.map((id) => ({
          key: cacheKey(id),
          value: (dbDocsById.get(id) as PongoDocument) ?? null,
        })),
        options,
      );
    }

    return ids.map((id, i) => {
      const cached = cachedResults[i];
      if (cached !== undefined) {
        return cached !== null
          ? (upcast({ ...cached } as unknown as Payload) as WithIdAndVersion<T>)
          : null;
      }
      return dbDocsById.get(id) ?? null;
    });
  };

  const findManyByIds = async (
    ids: string[],
    options: FindOptions | undefined,
  ): Promise<WithIdAndVersion<T>[]> => {
    const results = await fetchByIds(ids, options);
    return results.filter((doc): doc is WithIdAndVersion<T> => doc !== null);
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

  const cacheReplaceMany = (
    entries: { key: PongoDocumentCacheKey; value: PongoDocument | null }[],
    options: CollectionOperationOptions | undefined,
  ) => {
    const txCache = txCacheFor(options);
    if (txCache) return txCache.replaceMany(entries, { mainCache: cache });
    return cache.replaceMany(entries);
  };

  const cacheDeleteMany = (
    ids: string[],
    options: CollectionOperationOptions | undefined,
  ) =>
    cacheSetMany(
      ids.map((id) => ({ key: cacheKey(id), value: null })),
      options,
    );

  const deleteManyByIds = async (
    ids: Array<{ _id: string; _version?: bigint }>,
    options?: CollectionOperationOptions,
  ): Promise<PongoDeleteResult & { deletedIds: Set<string> }> => {
    await ensureCollectionCreated(options);

    const result = await command<{ _id: string; deleted?: bigint }>(
      SqlFor.deleteManyByIds(ids),
      options,
    );

    const deletedIds = new Set(
      result.rows
        .filter((row) => row.deleted === undefined || Number(row.deleted) > 0)
        .map((row) => row._id),
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
    replaceMany: async (
      documents: Array<WithIdAndVersion<T> | WithId<T>>,
      options?: ReplaceManyOptions,
    ): Promise<PongoReplaceManyResult> => {
      await ensureCollectionCreated(options);

      const downcasted = documents.map(
        (d) =>
          ({
            _id: d._id,
            _version: d._version,
            ...downcast(d as T),
          }) as unknown as WithIdAndVersion<T>,
      );

      const result = await command<{
        _id: string;
        version?: bigint | string | number;
      }>(SqlFor.replaceMany(downcasted), options);

      const modifiedIds = new Set<string>();
      const conflictIds = new Set<string>();
      const versions = new Map<string, bigint>();

      for (const row of result.rows) {
        modifiedIds.add(row._id);
        versions.set(row._id, row.version != null ? BigInt(row.version) : 1n);
      }

      for (const d of downcasted) {
        if (!modifiedIds.has(d._id)) conflictIds.add(d._id);
      }

      if (!options?.skipCache) {
        const cacheEntries = [...modifiedIds].map((id) => {
          const d = downcasted.find((x) => x._id === id)!;
          return {
            key: cacheKey(id),
            value: {
              ...d,
              _id: id,
              _version: versions.get(id) ?? 1n,
            },
          };
        });
        if (cacheEntries.length > 0)
          await cacheReplaceMany(cacheEntries, options);

        for (const id of conflictIds) await cacheDelete(cacheKey(id), options);
      }

      return operationResult<PongoReplaceManyResult>(
        {
          successful: modifiedIds.size > 0,
          modifiedCount: modifiedIds.size,
          matchedCount: documents.length,
          modifiedIds,
          conflictIds,
          versions,
        },
        { operationName: 'replaceMany', collectionName, serializer, errors },
      );
    },
    handle: async (
      id: string | string[],
      handle: DocumentHandler<T>,
      options?: HandleOptions & BatchHandleOptions,
    ): Promise<PongoHandleResult<T> | PongoHandleResult<T>[]> => {
      const isBatch = Array.isArray(id);
      const ids: string[] = isBatch ? id : [id];
      const {
        expectedVersion: version,
        skipConcurrencyCheck,
        ...operationOptions
      } = options ?? {};

      await ensureCollectionCreated(options);

      const docs = await fetchByIds(ids, operationOptions);

      type OpClassify =
        | { type: 'skip'; existing: WithIdAndVersion<T> | null }
        | { type: 'noop'; existing: WithIdAndVersion<T> | null }
        | { type: 'insert'; newDoc: WithoutId<T> }
        | { type: 'replace'; result: WithoutId<T>; _version?: bigint }
        | { type: 'delete'; _version?: bigint };

      const ops: OpClassify[] = await Promise.all(
        ids.map(async (docId, i) => {
          const existing = docs[i] ?? null;

          if (!isBatch) {
            const expectedVersion = expectedVersionValue(version);
            if (
              (existing == null && version === 'DOCUMENT_EXISTS') ||
              (existing == null && expectedVersion != null) ||
              (existing != null && version === 'DOCUMENT_DOES_NOT_EXIST') ||
              (existing != null &&
                expectedVersion !== null &&
                existing._version !== expectedVersion)
            ) {
              return { type: 'skip' as const, existing };
            }
          }

          const result = await handle(
            existing !== null ? ({ ...existing } as T) : null,
          );

          if (deepEquals(existing as T | null, result)) {
            return { type: 'noop' as const, existing };
          }

          if (!existing && result) {
            return {
              type: 'insert' as const,
              newDoc: { ...result, _id: docId } as WithoutId<T>,
            };
          }

          if (existing && !result) {
            const op: OpClassify = skipConcurrencyCheck
              ? { type: 'delete' as const }
              : {
                  type: 'delete' as const,
                  _version: existing._version as bigint,
                };
            return op;
          }

          const op: OpClassify = skipConcurrencyCheck
            ? { type: 'replace' as const, result: result as WithoutId<T> }
            : {
                type: 'replace' as const,
                result: result as WithoutId<T>,
                _version: existing!._version as bigint,
              };
          return op;
        }),
      );

      const toInsert = ids.flatMap((docId, i) => {
        const op = ops[i]!;
        if (op.type !== 'insert') return [];
        return [
          { _id: docId, ...op.newDoc } as OptionalUnlessRequiredIdAndVersion<T>,
        ];
      });

      const toReplace = [...ids].sort().flatMap((docId) => {
        const i = ids.indexOf(docId);
        const op = ops[i]!;
        if (op.type !== 'replace') return [];
        return [
          op._version !== undefined
            ? { ...op.result, _id: docId, _version: op._version }
            : { ...op.result, _id: docId },
        ];
      });

      const toDelete = [...ids].sort().flatMap((docId) => {
        const i = ids.indexOf(docId);
        const op = ops[i]!;
        if (op.type !== 'delete') return [];
        const entry = { _id: docId };
        return [
          op._version !== undefined
            ? { ...entry, _version: op._version }
            : entry,
        ];
      });

      let insertedIds = new Set<string>();
      let replaceResult: PongoReplaceManyResult | null = null;
      let deletedIds = new Set<string>();

      if (toInsert.length > 0) {
        const insertResult = await collection.insertMany(
          toInsert,
          operationOptions,
        );
        insertedIds = new Set(insertResult.insertedIds);
      }

      if (toReplace.length > 0) {
        replaceResult = await collection.replaceMany(
          toReplace as Array<WithIdAndVersion<T>>,
          operationOptions,
        );
      }

      if (toDelete.length > 0) {
        const deleteResult = await deleteManyByIds(toDelete, operationOptions);
        deletedIds = deleteResult.deletedIds;
      }

      const results: PongoHandleResult<T>[] = ids.map((docId, i) => {
        const op = ops[i]!;
        const existing =
          op.type !== 'insert' && 'existing' in op ? op.existing : null;

        if (op.type === 'skip' || op.type === 'noop') {
          return {
            ...operationResult<OperationResult>(
              { successful: op.type === 'noop' },
              { operationName: 'handle', collectionName, serializer, errors },
            ),
            document: existing as T | null,
          } as unknown as PongoHandleResult<T>;
        }

        if (op.type === 'insert') {
          const succeeded = insertedIds.has(docId);
          if (!succeeded) {
            void cacheDelete(cacheKey(docId), options);
          }
          return {
            ...operationResult<PongoInsertOneResult>(
              {
                successful: succeeded,
                insertedId: succeeded ? docId : null,
                nextExpectedVersion: 1n,
              },
              { operationName: 'handle', collectionName, serializer, errors },
            ),
            document: succeeded
              ? ({ ...op.newDoc, _id: docId, _version: 1n } as unknown as T)
              : null,
          } as unknown as PongoHandleResult<T>;
        }

        if (op.type === 'delete') {
          const succeeded = deletedIds.has(docId);
          return {
            ...operationResult<PongoDeleteResult>(
              {
                successful: succeeded,
                deletedCount: succeeded ? 1 : 0,
                matchedCount: 1,
              },
              { operationName: 'handle', collectionName, serializer, errors },
            ),
            document: null,
          } as unknown as PongoHandleResult<T>;
        }

        const succeeded = replaceResult?.modifiedIds.has(docId) ?? false;
        const newVersion = replaceResult?.versions.get(docId) ?? 0n;
        return {
          ...operationResult<PongoUpdateResult>(
            {
              successful: succeeded,
              modifiedCount: succeeded ? 1 : 0,
              matchedCount: 1,
              nextExpectedVersion: newVersion,
            },
            { operationName: 'handle', collectionName, serializer, errors },
          ),
          document: succeeded
            ? ({ ...op.result, _version: newVersion } as unknown as T)
            : (existing as T | null),
        } as unknown as PongoHandleResult<T>;
      });

      return isBatch ? results : results[0]!;
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
      return collection as unknown as PongoCollection<T>;
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

  return collection as unknown as PongoCollection<T>;
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
