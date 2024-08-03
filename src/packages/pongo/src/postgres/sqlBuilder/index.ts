import { sql, type SQL } from '@event-driven-io/dumbo';
import format from 'pg-format';
import type { PongoCollectionSQLBuilder } from '../../core';
import {
  type PongoFilter,
  type PongoUpdate,
  type WithId,
  type WithoutId,
} from '../../core';
import { constructFilterQuery } from './filter';
import { buildUpdateQuery } from './update';

export const postgresSQLBuilder = (
  collectionName: string,
): PongoCollectionSQLBuilder => ({
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
