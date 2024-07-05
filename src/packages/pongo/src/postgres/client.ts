import type { Pool } from 'pg';
import { v4 as uuid } from 'uuid';
import {
  type DbClient,
  type PongoCollection,
  type PongoDeleteResult,
  type PongoFilter,
  type PongoInsertResult,
  type PongoUpdate,
  type PongoUpdateResult,
} from '../main';
import { constructFilterQuery } from './filter';
import { getPool } from './pool';
import { constructUpdateQuery } from './update';
import { sql } from './execute';

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
  pool: Pool,
): PongoCollection<T> => {
  const createCollection = async (): Promise<void> => {
    await sql(
      pool,
      'CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY, data JSONB)',
      collectionName,
    );
  };

  return {
    createCollection,
    insertOne: async (document: T): Promise<PongoInsertResult> => {
      await createCollection();

      const id = uuid();

      const result = await sql(
        pool,
        'INSERT INTO %I (id, data) VALUES (%L, %L)',
        collectionName,
        id,
        JSON.stringify({ ...document, _id: id }),
      );

      return result.rowCount
        ? { insertedId: id, insertedCount: result.rowCount }
        : { insertedId: null, insertedCount: null };
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
      return { modifiedCount: result.rowCount };
    },
    deleteOne: async (filter: PongoFilter<T>): Promise<PongoDeleteResult> => {
      const filterQuery = constructFilterQuery(filter);
      const result = await sql(
        pool,
        'DELETE FROM %I WHERE %s',
        collectionName,
        filterQuery,
      );
      return { deletedCount: result.rowCount };
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
        'SELECT data FROM %I WHERE %s LIMIT 1',
        collectionName,
        filterQuery,
      );

      return result.rows.map((row) => row.data as T);
    },
  };
};
