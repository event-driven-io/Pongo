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
import type { PongoCollectionSchemaComponent } from '..';
import {
  pongoCacheWrapper,
  inMemoryCacheProvider,
  resolveCacheConfig,
  type CacheConfig,
  type PongoCacheProvider,
} from '../cache';
import {
  deepEquals,
  expectedVersionValue,
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
  cache?: CacheConfig | 'disabled' | PongoCacheProvider;
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
  cache: cacheOption,
}: PongoCollectionOptions<T, DriverType, Payload>): PongoCollection<T> => {
  const SqlFor = schemaComponent.sqlBuilder;
  const sqlExecutor = pool.execute;

  // ── cache setup ─────────────────────────────────────────────────────────────
  const cacheProvider: PongoCacheProvider | null = (() => {
    if (cacheOption === 'disabled') return null;
    if (cacheOption === undefined) {
      const resolved = resolveCacheConfig();
      if (resolved === 'disabled') return null;
      const opts = {
        ...(resolved.max !== undefined ? { max: resolved.max } : {}),
        ...(resolved.ttl !== undefined ? { ttl: resolved.ttl } : {}),
      };
      const raw = inMemoryCacheProvider(opts);
      return pongoCacheWrapper({
        provider: raw,
        dbName: db.databaseName,
        collectionName,
      });
    }
    // already a provider instance
    if (typeof (cacheOption as PongoCacheProvider).get === 'function') {
      return cacheOption as PongoCacheProvider;
    }
    // CacheConfig object
    const config = cacheOption as CacheConfig;
    if (config === 'disabled') return null;
    const resolved = resolveCacheConfig(config);
    if (resolved === 'disabled') return null;
    const opts = {
      ...(resolved.max !== undefined ? { max: resolved.max } : {}),
      ...(resolved.ttl !== undefined ? { ttl: resolved.ttl } : {}),
    };
    const raw = inMemoryCacheProvider(opts);
    return pongoCacheWrapper({
      provider: raw,
      dbName: db.databaseName,
      collectionName,
    });
  })();

  // Helper: does the filter target exactly _id?
  const isIdFilter = (
    filter: PongoFilter<T> | SQL | undefined,
  ): string | null => {
    if (!filter || typeof filter !== 'object' || Array.isArray(filter))
      return null;
    const keys = Object.keys(filter as object);
    if (keys.length === 1 && keys[0] === '_id') {
      const id = (filter as Record<string, unknown>)['_id'];
      if (typeof id === 'string') return id;
    }
    return null;
  };

  // Helper: extract $in id list from filter like { _id: { $in: [...] } }
  const getInIds = (
    filter: PongoFilter<T> | SQL | undefined,
  ): string[] | null => {
    if (!filter || typeof filter !== 'object') return null;
    const f = filter as Record<string, unknown>;
    if (Object.keys(f).length !== 1 || !('_id' in f)) return null;
    const idVal = f['_id'];
    if (idVal && typeof idVal === 'object' && '$in' in idVal) {
      const ids = (idVal as Record<string, unknown>)['$in'];
      if (Array.isArray(ids) && ids.every((i) => typeof i === 'string'))
        return ids;
    }
    return null;
  };

  const columnMapping = {
    mapping: {
      ...mapColumnToJSON('data', serializer),
      //...mapColumnToJSON('metadata'),
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

      if (successful && cacheProvider && !options?.skipCache) {
        const doc = { ...document, _id, _version } as PongoDocument;
        await cacheProvider.set(_id, doc);
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

      if (cacheProvider && !options?.skipCache) {
        await cacheProvider.setMany(
          rows.map((r) => ({
            key: r._id,
            value: r as PongoDocument,
          })),
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

      if (opResult.successful && cacheProvider && !options?.skipCache) {
        const id = isIdFilter(filter);
        if (id) {
          // Evict stale entry; fresh value will be loaded on next findOne
          await cacheProvider.delete(id);
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

      if (opResult.successful && cacheProvider && !options?.skipCache) {
        const id = isIdFilter(filter);
        if (id) {
          const newVersion = opResult.nextExpectedVersion;
          await cacheProvider.set(id, {
            ...(downcasted as PongoDocument),
            _id: id,
            _version: newVersion,
          });
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

      if (
        opResult.successful &&
        cacheProvider &&
        !options?.skipCache &&
        filter
      ) {
        const id = isIdFilter(filter);
        if (id) await cacheProvider.delete(id);
      }

      return opResult;
    },
    deleteMany: async (
      filter?: PongoFilter<T>,
      options?: DeleteManyOptions,
    ): Promise<PongoDeleteResult> => {
      await ensureCollectionCreated(options);

      const result = await command(SqlFor.deleteMany(filter ?? {}), options);

      if (cacheProvider && !options?.skipCache && filter) {
        const ids = getInIds(filter);
        if (ids) await cacheProvider.deleteMany(ids);
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

      // Cache read path: only for _id-only filters
      if (cacheProvider && !options?.skipCache && filter) {
        const id = isIdFilter(filter);
        if (id) {
          const cached = await cacheProvider.get(id);
          if (cached !== undefined) {
            return cached === null
              ? null
              : (upcast({
                  ...cached,
                } as unknown as Payload) as WithIdAndVersion<T>);
          }
          // cache miss — query DB, populate cache
          const result = await query<{ data: T; _version: bigint }>(
            SqlFor.findOne(filter),
            options,
          );
          const row = result.rows[0];
          if (!row) {
            return null;
          }
          const doc = upcast({
            ...row.data,
            _version: row._version,
          } as unknown as Payload) as WithIdAndVersion<T>;
          await cacheProvider.set(id, doc as PongoDocument);
          return doc;
        }
      }

      const result = await query<{ data: T; _version: bigint }>(
        SqlFor.findOne(filter ?? {}),
        options,
      );

      const row = result.rows[0];
      if (row === undefined || row === null) return null;

      return upcast({
        ...row.data,
        _version: row._version,
      } as unknown as Payload) as WithIdAndVersion<T>;
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
        if (!insertResult.successful && cacheProvider) {
          await cacheProvider.delete(id);
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
        if (!deleteResult.successful && cacheProvider) {
          await cacheProvider.delete(id);
        }
        return { ...deleteResult, document: null };
      }

      if (existing && result) {
        const replaceResult = await collection.replaceOne(byId, result, {
          ...operationOptions,
          expectedVersion: expectedVersion ?? 'DOCUMENT_EXISTS',
        });
        if (!replaceResult.successful && cacheProvider) {
          await cacheProvider.delete(id);
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

      // Cache batch path: { _id: { $in: [...] } }
      if (cacheProvider && !options?.skipCache && filter) {
        const ids = getInIds(filter);
        if (ids && ids.length > 0) {
          const cached = await cacheProvider.getMany(ids);
          const results: WithIdAndVersion<T>[] = [];
          const missIds: string[] = [];

          for (let i = 0; i < ids.length; i++) {
            const entry = cached[i];
            if (entry !== undefined) {
              if (entry !== null) {
                results.push(
                  upcast({
                    ...entry,
                  } as unknown as Payload) as WithIdAndVersion<T>,
                );
              }
            } else {
              missIds.push(ids[i]!);
            }
          }

          if (missIds.length > 0) {
            const missFilter = {
              _id: { $in: missIds },
            } as unknown as PongoFilter<T>;
            const dbResult = await query<{ data: T; _version: bigint }>(
              SqlFor.find(missFilter, options),
            );
            const setEntries: { key: string; value: PongoDocument }[] = [];
            for (const row of dbResult.rows) {
              const doc = upcast({
                ...row.data,
                _version: row._version,
              } as unknown as Payload) as WithIdAndVersion<T>;
              results.push(doc);
              setEntries.push({
                key: (doc as PongoDocument)['_id'] as string,
                value: doc as PongoDocument,
              });
            }
            if (setEntries.length > 0) await cacheProvider.setMany(setEntries);
          }

          return results;
        }
      }

      const result = await query<{ data: T; _version: bigint }>(
        SqlFor.find(filter ?? {}, options),
      );
      return result.rows.map(
        (row) =>
          upcast({
            ...row.data,
            _version: row._version,
          } as unknown as Payload) as WithIdAndVersion<T>,
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
