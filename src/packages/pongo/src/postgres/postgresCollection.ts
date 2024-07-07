import pg from 'pg';
import { v4 as uuid } from 'uuid';
import {
  type PongoCollection,
  type PongoDeleteResult,
  type PongoFilter,
  type PongoInsertOneResult,
  type PongoUpdate,
  type PongoUpdateResult,
} from '../main';
import { executeSQL } from './execute';
import { constructFilterQuery } from './filter';
import { sql, type SQL } from './sql';
import { buildUpdateQuery } from './update';

export const postgresCollection = <T>(
  collectionName: string,
  pool: pg.Pool,
): PongoCollection<T> => {
  const execute = (sql: SQL) => executeSQL(pool, sql);
  const SqlFor = collectionSQLBuilder(collectionName);

  const createCollection = execute(SqlFor.createCollection());

  return {
    createCollection: async () => {
      await createCollection;
    },
    insertOne: async (document: T): Promise<PongoInsertOneResult> => {
      await createCollection;

      const id = uuid();

      const result = await execute(SqlFor.insertOne(id, document));

      return result.rowCount
        ? { insertedId: id, acknowledged: true }
        : { insertedId: null, acknowledged: false };
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
    deleteOne: async (filter: PongoFilter<T>): Promise<PongoDeleteResult> => {
      await createCollection;

      const result = await execute(SqlFor.deleteOne(filter));
      return result.rowCount
        ? { acknowledged: true, deletedCount: result.rowCount }
        : { acknowledged: false, deletedCount: 0 };
    },
    findOne: async (filter: PongoFilter<T>): Promise<T | null> => {
      await createCollection;

      const result = await execute(SqlFor.findOne(filter));
      return (result.rows[0]?.data ?? null) as T | null;
    },
    find: async (filter: PongoFilter<T>): Promise<T[]> => {
      await createCollection;

      const result = await execute(SqlFor.find(filter));
      return result.rows.map((row) => row.data as T);
    },
  };
};

export const collectionSQLBuilder = (collectionName: string) => ({
  createCollection: (): SQL =>
    sql(
      'CREATE TABLE IF NOT EXISTS %I (_id UUID PRIMARY KEY, data JSONB)',
      collectionName,
    ),
  insertOne: <T>(id: string, document: T): SQL =>
    sql(
      'INSERT INTO %I (_id, data) VALUES (%L, %L)',
      collectionName,
      id,
      JSON.stringify({ ...document, _id: id }),
    ),
  updateOne: <T>(filter: PongoFilter<T>, update: PongoUpdate<T>): SQL => {
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
});
