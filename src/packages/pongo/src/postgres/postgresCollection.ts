import {
  single,
  sql,
  type ConnectionPool,
  type SQL,
} from '@event-driven-io/dumbo';
import pg from 'pg';
import format from 'pg-format';
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
} from '../main';
import { constructFilterQuery } from './filter';
import { buildUpdateQuery } from './update';

export const postgresCollection = <T extends PongoDocument>(
  collectionName: string,
  { dbName, pool }: { dbName: string; pool: ConnectionPool },
): PongoCollection<T> => {
  const execute = <T extends pg.QueryResultRow = pg.QueryResultRow>(sql: SQL) =>
    pool.execute.query<T>(sql);

  const SqlFor = collectionSQLBuilder(collectionName);

  const createCollection = execute(SqlFor.createCollection());

  const collection = {
    dbName,
    collectionName,
    createCollection: async () => {
      await createCollection;
    },
    insertOne: async (document: T): Promise<PongoInsertOneResult> => {
      await createCollection;

      const _id = uuid();

      const result = await execute(SqlFor.insertOne({ _id, ...document }));

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

      const result = await execute(SqlFor.insertMany(rows));

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

      const result = await execute(SqlFor.updateOne(filter, update));
      return result.rowCount
        ? { acknowledged: true, modifiedCount: result.rowCount }
        : { acknowledged: false, modifiedCount: 0 };
    },
    replaceOne: async (
      filter: PongoFilter<T>,
      document: WithoutId<T>,
    ): Promise<PongoUpdateResult> => {
      await createCollection;

      const result = await execute(SqlFor.replaceOne(filter, document));
      return result.rowCount
        ? { acknowledged: true, modifiedCount: result.rowCount }
        : { acknowledged: false, modifiedCount: 0 };
    },
    updateMany: async (
      filter: PongoFilter<T>,
      update: PongoUpdate<T>,
    ): Promise<PongoUpdateResult> => {
      await createCollection;

      const result = await execute(SqlFor.updateMany(filter, update));
      return result.rowCount
        ? { acknowledged: true, modifiedCount: result.rowCount }
        : { acknowledged: false, modifiedCount: 0 };
    },
    deleteOne: async (filter?: PongoFilter<T>): Promise<PongoDeleteResult> => {
      await createCollection;

      const result = await execute(SqlFor.deleteOne(filter ?? {}));
      return result.rowCount
        ? { acknowledged: true, deletedCount: result.rowCount }
        : { acknowledged: false, deletedCount: 0 };
    },
    deleteMany: async (filter?: PongoFilter<T>): Promise<PongoDeleteResult> => {
      await createCollection;

      const result = await execute(SqlFor.deleteMany(filter ?? {}));
      return result.rowCount
        ? { acknowledged: true, deletedCount: result.rowCount }
        : { acknowledged: false, deletedCount: 0 };
    },
    findOne: async (filter?: PongoFilter<T>): Promise<T | null> => {
      await createCollection;

      const result = await execute(SqlFor.findOne(filter ?? {}));
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

      const result = await execute(SqlFor.find(filter ?? {}));
      return result.rows.map((row) => row.data as T);
    },
    countDocuments: async (filter?: PongoFilter<T>): Promise<number> => {
      await createCollection;

      const { count } = await single(
        execute<{ count: number }>(SqlFor.countDocuments(filter ?? {})),
      );
      return count;
    },
    drop: async (): Promise<boolean> => {
      await createCollection;
      const result = await execute(SqlFor.drop());
      return (result?.rowCount ?? 0) > 0;
    },
    rename: async (newName: string): Promise<PongoCollection<T>> => {
      await createCollection;
      await execute(SqlFor.rename(newName));
      collectionName = newName;
      return collection;
    },
  };

  return collection;
};

export const collectionSQLBuilder = (collectionName: string) => ({
  createCollection: (): SQL =>
    sql(
      `CREATE TABLE IF NOT EXISTS %I (
        _id           TEXT           PRIMARY KEY, 
        data          JSONB          NOT NULL, 
        metadata      JSONB          NOT NULL     DEFAULT '{}',
        _version      BIGINT         NOT NULL     DEFAULT 1,
        _partition    TEXT           NOT NULL     DEFAULT 'png_global',
        _archived     BOOLEAN        NOT NULL     DEFAULT FALSE,
        _created      TIMESTAMPTZ    NOT NULL     DEFAULT now(),
        _updated      TIMESTAMPTZ    NOT NULL     DEFAULT now()
    )`,
      collectionName,
    ),
  insertOne: <T>(document: WithId<T>): SQL =>
    sql(
      'INSERT INTO %I (_id, data) VALUES (%L, %L)',
      collectionName,
      document._id,
      JSON.stringify(document),
    ),
  insertMany: <T>(documents: WithId<T>[]): SQL => {
    const values = documents
      .map((doc) => format('(%L, %L)', doc._id, JSON.stringify(doc)))
      .join(', ');
    return sql('INSERT INTO %I (_id, data) VALUES %s', collectionName, values);
  },
  updateOne: <T>(filter: PongoFilter<T>, update: PongoUpdate<T>): SQL => {
    const filterQuery = constructFilterQuery(filter);
    const updateQuery = buildUpdateQuery(update);

    return sql(
      `WITH cte AS (
        SELECT _id FROM %I WHERE %s LIMIT 1
      )
      UPDATE %I SET data = %s FROM cte WHERE %I._id = cte._id`,
      collectionName,
      filterQuery,
      collectionName,
      updateQuery,
      collectionName,
    );
  },
  replaceOne: <T>(filter: PongoFilter<T>, document: WithoutId<T>): SQL => {
    const filterQuery = constructFilterQuery(filter);

    return sql(
      `UPDATE %I SET data = %L || jsonb_build_object('_id', data->>'_id') WHERE %s`,
      collectionName,
      JSON.stringify(document),
      filterQuery,
    );
  },
  updateMany: <T>(filter: PongoFilter<T>, update: PongoUpdate<T>): SQL => {
    const filterQuery = constructFilterQuery(filter);
    const updateQuery = buildUpdateQuery(update);

    return sql(
      'UPDATE %I SET data = %s WHERE %s',
      collectionName,
      updateQuery,
      filterQuery,
    );
  },
  deleteOne: <T>(filter: PongoFilter<T>): SQL => {
    const filterQuery = constructFilterQuery(filter);
    return sql('DELETE FROM %I WHERE %s', collectionName, filterQuery);
  },
  deleteMany: <T>(filter: PongoFilter<T>): SQL => {
    const filterQuery = constructFilterQuery(filter);
    return sql('DELETE FROM %I WHERE %s', collectionName, filterQuery);
  },
  findOne: <T>(filter: PongoFilter<T>): SQL => {
    const filterQuery = constructFilterQuery(filter);
    return sql(
      'SELECT data FROM %I WHERE %s LIMIT 1',
      collectionName,
      filterQuery,
    );
  },
  find: <T>(filter: PongoFilter<T>): SQL => {
    const filterQuery = constructFilterQuery(filter);
    return sql('SELECT data FROM %I WHERE %s', collectionName, filterQuery);
  },
  countDocuments: <T>(filter: PongoFilter<T>): SQL => {
    const filterQuery = constructFilterQuery(filter);
    return sql(
      'SELECT COUNT(1) as count FROM %I WHERE %s',
      collectionName,
      filterQuery,
    );
  },
  rename: (newName: string): SQL =>
    sql('ALTER TABLE %I RENAME TO %I', collectionName, newName),
  drop: (targetName: string = collectionName): SQL =>
    sql('DROP TABLE IF EXISTS %I', targetName),
});
