import pg from 'pg';
import { v4 as uuid } from 'uuid';
import {
  type DbClient,
  type PongoCollection,
  type PongoDeleteResult,
  type PongoFilter,
  type PongoInsertOneResult,
  type PongoUpdate,
  type PongoUpdateResult,
} from '../main';
import { executeSQL } from './execute';
import { constructFilterQuery } from './filter';
import { endPool, getPool } from './pool';
import { sql } from './sql';
import { constructUpdateQuery } from './update';

export const postgresClient = (
  connectionString: string,
  database?: string,
): DbClient => {
  const pool = getPool({ connectionString, database });

  return {
    connect: () => Promise.resolve(),
    close: () => endPool(connectionString),
    collection: <T>(name: string) => postgresCollection<T>(name, pool),
  };
};

export const postgresCollection = <T>(
  collectionName: string,
  pool: pg.Pool,
): PongoCollection<T> => {
  const createCollection = executeSQL(
    pool,
    sql(
      'CREATE TABLE IF NOT EXISTS %I (_id UUID PRIMARY KEY, data JSONB)',
      collectionName,
    ),
  );
  return {
    createCollection: async () => {
      await createCollection;
    },
    insertOne: async (document: T): Promise<PongoInsertOneResult> => {
      await createCollection;

      const id = uuid();

      const result = await executeSQL(
        pool,
        sql(
          'INSERT INTO %I (_id, data) VALUES (%L, %L)',
          collectionName,
          id,
          JSON.stringify({ ...document, _id: id }),
        ),
      );

      return result.rowCount
        ? { insertedId: id, acknowledged: true }
        : { insertedId: null, acknowledged: false };
    },
    updateOne: async (
      filter: PongoFilter<T>,
      update: PongoUpdate<T>,
    ): Promise<PongoUpdateResult> => {
      await createCollection;

      const filterQuery = constructFilterQuery(filter);
      const updateQuery = constructUpdateQuery(update);

      const result = await executeSQL(
        pool,
        sql(
          'UPDATE %I SET data = %s WHERE %s',
          collectionName,
          updateQuery,
          filterQuery,
        ),
      );
      return result.rowCount
        ? { acknowledged: true, modifiedCount: result.rowCount }
        : { acknowledged: false, modifiedCount: 0 };
    },
    deleteOne: async (filter: PongoFilter<T>): Promise<PongoDeleteResult> => {
      await createCollection;

      const filterQuery = constructFilterQuery(filter);
      const result = await executeSQL(
        pool,
        sql('DELETE FROM %I WHERE %s', collectionName, filterQuery),
      );
      return result.rowCount
        ? { acknowledged: true, deletedCount: result.rowCount }
        : { acknowledged: false, deletedCount: 0 };
    },
    findOne: async (filter: PongoFilter<T>): Promise<T | null> => {
      await createCollection;

      const filterQuery = constructFilterQuery(filter);
      const result = await executeSQL(
        pool,
        sql(
          'SELECT data FROM %I WHERE %s LIMIT 1',
          collectionName,
          filterQuery,
        ),
      );
      return (result.rows[0]?.data ?? null) as T | null;
    },
    find: async (filter: PongoFilter<T>): Promise<T[]> => {
      await createCollection;

      const filterQuery = constructFilterQuery(filter);
      const result = await executeSQL(
        pool,
        sql('SELECT data FROM %I WHERE %s', collectionName, filterQuery),
      );

      return result.rows.map((row) => row.data as T);
    },
  };
};
