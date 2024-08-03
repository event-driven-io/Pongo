import { single, type SQL, type SQLExecutor } from '@event-driven-io/dumbo';
import { v4 as uuid } from 'uuid';
import {
  type DocumentHandler,
  type PongoCollection,
  type PongoDeleteResult,
  type PongoDocument,
  type PongoFilter,
  type PongoInsertManyResult,
  type PongoInsertOneResult,
  type PongoUpdate,
  type PongoUpdateResult,
  type WithId,
  type WithoutId,
} from '.';

export type PongoCollectionOptions = {
  collectionName: string;
  dbName: string;
  sqlExecutor: SQLExecutor;
  sqlBuilder: PongoCollectionSQLBuilder;
};

export const pongoCollection = <T extends PongoDocument>({
  collectionName,
  dbName,
  sqlExecutor: { command, query },
  sqlBuilder: SqlFor,
}: PongoCollectionOptions): PongoCollection<T> => {
  const createCollection = command(SqlFor.createCollection());

  const collection = {
    dbName,
    collectionName,
    createCollection: async () => {
      await createCollection;
    },
    insertOne: async (document: T): Promise<PongoInsertOneResult> => {
      await createCollection;

      const _id = uuid();

      const result = await command(SqlFor.insertOne({ _id, ...document }));

      return result.rowCount
        ? { insertedId: _id, acknowledged: true }
        : { insertedId: null, acknowledged: false };
    },
    insertMany: async (documents: T[]): Promise<PongoInsertManyResult> => {
      await createCollection;

      const rows = documents.map((doc) => ({
        _id: uuid(),
        ...doc,
      }));

      const result = await command(SqlFor.insertMany(rows));

      return {
        acknowledged: result.rowCount === rows.length,
        insertedCount: result.rowCount ?? 0,
        insertedIds: rows.map((d) => d._id),
      };
    },
    updateOne: async (
      filter: PongoFilter<T>,
      update: PongoUpdate<T>,
    ): Promise<PongoUpdateResult> => {
      await createCollection;

      const result = await command(SqlFor.updateOne(filter, update));
      return result.rowCount
        ? { acknowledged: true, modifiedCount: result.rowCount }
        : { acknowledged: false, modifiedCount: 0 };
    },
    replaceOne: async (
      filter: PongoFilter<T>,
      document: WithoutId<T>,
    ): Promise<PongoUpdateResult> => {
      await createCollection;

      const result = await command(SqlFor.replaceOne(filter, document));
      return result.rowCount
        ? { acknowledged: true, modifiedCount: result.rowCount }
        : { acknowledged: false, modifiedCount: 0 };
    },
    updateMany: async (
      filter: PongoFilter<T>,
      update: PongoUpdate<T>,
    ): Promise<PongoUpdateResult> => {
      await createCollection;

      const result = await command(SqlFor.updateMany(filter, update));
      return result.rowCount
        ? { acknowledged: true, modifiedCount: result.rowCount }
        : { acknowledged: false, modifiedCount: 0 };
    },
    deleteOne: async (filter?: PongoFilter<T>): Promise<PongoDeleteResult> => {
      await createCollection;

      const result = await command(SqlFor.deleteOne(filter ?? {}));
      return result.rowCount
        ? { acknowledged: true, deletedCount: result.rowCount }
        : { acknowledged: false, deletedCount: 0 };
    },
    deleteMany: async (filter?: PongoFilter<T>): Promise<PongoDeleteResult> => {
      await createCollection;

      const result = await command(SqlFor.deleteMany(filter ?? {}));
      return result.rowCount
        ? { acknowledged: true, deletedCount: result.rowCount }
        : { acknowledged: false, deletedCount: 0 };
    },
    findOne: async (filter?: PongoFilter<T>): Promise<T | null> => {
      await createCollection;

      const result = await query(SqlFor.findOne(filter ?? {}));
      return (result.rows[0]?.data ?? null) as T | null;
    },
    findOneAndDelete: async (filter: PongoFilter<T>): Promise<T | null> => {
      await createCollection;

      const existingDoc = await collection.findOne(filter);

      if (existingDoc === null) return null;

      await collection.deleteOne(filter);
      return existingDoc;
    },
    findOneAndReplace: async (
      filter: PongoFilter<T>,
      replacement: WithoutId<T>,
    ): Promise<T | null> => {
      await createCollection;

      const existingDoc = await collection.findOne(filter);

      if (existingDoc === null) return null;

      await collection.replaceOne(filter, replacement);

      return existingDoc;
    },
    findOneAndUpdate: async (
      filter: PongoFilter<T>,
      update: PongoUpdate<T>,
    ): Promise<T | null> => {
      await createCollection;

      const existingDoc = await collection.findOne(filter);

      if (existingDoc === null) return null;

      await collection.updateOne(filter, update);

      return existingDoc;
    },
    handle: async (
      id: string,
      handle: DocumentHandler<T>,
    ): Promise<T | null> => {
      await createCollection;

      const byId: PongoFilter<T> = { _id: id };

      const existing = await collection.findOne(byId);

      const result = await handle(existing);

      if (!existing && result) {
        const newDoc = { ...result, _id: id };
        await collection.insertOne({ ...newDoc, _id: id });
        return newDoc;
      }

      if (existing && !result) {
        await collection.deleteOne(byId);
        return null;
      }

      if (existing && result) await collection.replaceOne(byId, result);

      return result;
    },
    find: async (filter?: PongoFilter<T>): Promise<T[]> => {
      await createCollection;

      const result = await query(SqlFor.find(filter ?? {}));
      return result.rows.map((row) => row.data as T);
    },
    countDocuments: async (filter?: PongoFilter<T>): Promise<number> => {
      await createCollection;

      const { count } = await single(
        query<{ count: number }>(SqlFor.countDocuments(filter ?? {})),
      );
      return count;
    },
    drop: async (): Promise<boolean> => {
      await createCollection;
      const result = await command(SqlFor.drop());
      return (result?.rowCount ?? 0) > 0;
    },
    rename: async (newName: string): Promise<PongoCollection<T>> => {
      await createCollection;
      await command(SqlFor.rename(newName));
      collectionName = newName;
      return collection;
    },
  };

  return collection;
};

export type PongoCollectionSQLBuilder = {
  createCollection: () => SQL;
  insertOne: <T>(document: WithId<T>) => SQL;
  insertMany: <T>(documents: WithId<T>[]) => SQL;
  updateOne: <T>(filter: PongoFilter<T>, update: PongoUpdate<T>) => SQL;
  replaceOne: <T>(filter: PongoFilter<T>, document: WithoutId<T>) => SQL;
  updateMany: <T>(filter: PongoFilter<T>, update: PongoUpdate<T>) => SQL;
  deleteOne: <T>(filter: PongoFilter<T>) => SQL;
  deleteMany: <T>(filter: PongoFilter<T>) => SQL;
  findOne: <T>(filter: PongoFilter<T>) => SQL;
  find: <T>(filter: PongoFilter<T>) => SQL;
  countDocuments: <T>(filter: PongoFilter<T>) => SQL;
  rename: (newName: string) => SQL;
  drop: () => SQL;
};
