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
import { sql } from './execute';
import { constructFilterQuery } from './filter';
import { getPool } from './pool';
import { constructUpdateQuery } from './update';

export const postgresClient = (
  connectionString: string,
  database?: string,
): DbClient => {
  const pool = getPool({ connectionString, database });

  return {
    connect: () => Promise.resolve(),
    close: () => Promise.resolve(),
    collection: <T>(name: string) => postgresCollection<T>(name, pool),
  };
};

export const postgresCollection = <T>(
  collectionName: string,
  pool: pg.Pool,
): PongoCollection<T> => {
  const createCollection = async (): Promise<void> => {
    await sql(
      pool,
      'CREATE TABLE IF NOT EXISTS %I (_id UUID PRIMARY KEY, data JSONB)',
      collectionName,
    );
  };

  return {
    createCollection,
    insertOne: async (document: T): Promise<PongoInsertOneResult> => {
      await createCollection();

      const id = uuid();

      const result = await sql(
        pool,
        'INSERT INTO %I (_id, data) VALUES (%L, %L)',
        collectionName,
        id,
        JSON.stringify({ ...document, _id: id }),
      );

      return result.rowCount
        ? { insertedId: id, acknowledged: true }
        : { insertedId: null, acknowledged: false };
    },
    updateOne: async (
      filter: PongoFilter<T>,
      update: PongoUpdate<T>,
    ): Promise<PongoUpdateResult> => {
      const filterQuery = constructFilterQuery(filter);
      const updateQuery = constructUpdateQuery(update);

      const result = await sql(
        pool,
        'UPDATE %I SET data = %s WHERE %s',
        collectionName,
        updateQuery,
        filterQuery,
      );
      return result.rowCount
        ? { acknowledged: true, modifiedCount: result.rowCount }
        : { acknowledged: false, modifiedCount: 0 };
    },
    deleteOne: async (filter: PongoFilter<T>): Promise<PongoDeleteResult> => {
      const filterQuery = constructFilterQuery(filter);
      const result = await sql(
        pool,
        'DELETE FROM %I WHERE %s',
        collectionName,
        filterQuery,
      );
      return result.rowCount
        ? { acknowledged: true, deletedCount: result.rowCount }
        : { acknowledged: false, deletedCount: 0 };
    },
    findOne: async (filter: PongoFilter<T>): Promise<T | null> => {
      const filterQuery = constructFilterQuery(filter);
      const result = await sql(
        pool,
        'SELECT data FROM %I WHERE %s LIMIT 1',
        collectionName,
        filterQuery,
      );
      return (result.rows[0]?.data ?? null) as T | null;
    },
    find: async (filter: PongoFilter<T>): Promise<T[]> => {
      const filterQuery = constructFilterQuery(filter);
      const result = await sql(
        pool,
        'SELECT data FROM %I WHERE %s',
        collectionName,
        filterQuery,
      );

      return result.rows.map((row) => row.data as T);
    },
  };
};
