import {
  rawSql,
  sql,
  sqlMigration,
  type SQL,
  type SQLMigration,
} from '@event-driven-io/dumbo';
import {
  type OptionalUnlessRequiredId,
  type PongoCollectionSQLBuilder,
  type PongoFilter,
  type PongoUpdate,
  type WithoutId,
} from '../../core';
import { constructFilterQuery } from './filter';
import { buildUpdateQuery } from './update';

const createCollection = (collectionName: string): SQL =>
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
  );

export const pongoCollectionPostgreSQLMigrations = (collectionName: string) => [
  sqlMigration(`pongoCollection:${collectionName}:001:createtable`, [
    createCollection(collectionName),
  ]),
];

export const postgresSQLBuilder = (
  collectionName: string,
): PongoCollectionSQLBuilder => ({
  migrations: (): SQLMigration[] =>
    pongoCollectionPostgreSQLMigrations(collectionName),
  createCollection: (): SQL => createCollection(collectionName),
  insertOne: <T>(document: OptionalUnlessRequiredId<T>): SQL =>
    sql(
      'INSERT INTO %I (_id, data) VALUES (%L, %L)',
      collectionName,
      document._id,
      JSON.stringify(document),
    ),
  insertMany: <T>(documents: OptionalUnlessRequiredId<T>[]): SQL => {
    const values = documents
      .map((doc) => sql('(%L, %L)', doc._id, JSON.stringify(doc)))
      .join(', ');
    return sql('INSERT INTO %I (_id, data) VALUES %s', collectionName, values);
  },
  updateOne: <T>(filter: PongoFilter<T>, update: PongoUpdate<T>): SQL => {
    const filterQuery = constructFilterQuery(filter);
    const updateQuery = buildUpdateQuery(update);

    return sql(
      `WITH cte AS (
        SELECT _id FROM %I %s LIMIT 1
      )
      UPDATE %I SET data = %s FROM cte WHERE %I._id = cte._id`,
      collectionName,
      where(filterQuery),
      collectionName,
      updateQuery,
      collectionName,
    );
  },
  replaceOne: <T>(filter: PongoFilter<T>, document: WithoutId<T>): SQL => {
    const filterQuery = constructFilterQuery(filter);

    return sql(
      `UPDATE %I SET data = %L || jsonb_build_object('_id', data->>'_id') %s`,
      collectionName,
      JSON.stringify(document),
      where(filterQuery),
    );
  },
  updateMany: <T>(filter: PongoFilter<T>, update: PongoUpdate<T>): SQL => {
    const filterQuery = constructFilterQuery(filter);
    const updateQuery = buildUpdateQuery(update);

    return sql(
      'UPDATE %I SET data = %s %s',
      collectionName,
      updateQuery,
      where(filterQuery),
    );
  },
  deleteOne: <T>(filter: PongoFilter<T>): SQL => {
    const filterQuery = constructFilterQuery(filter);
    return sql('DELETE FROM %I %s', collectionName, where(filterQuery));
  },
  deleteMany: <T>(filter: PongoFilter<T>): SQL => {
    const filterQuery = constructFilterQuery(filter);
    return sql('DELETE FROM %I %s', collectionName, where(filterQuery));
  },
  findOne: <T>(filter: PongoFilter<T>): SQL => {
    const filterQuery = constructFilterQuery(filter);
    return sql(
      'SELECT data FROM %I %s LIMIT 1',
      collectionName,
      where(filterQuery),
    );
  },
  find: <T>(filter: PongoFilter<T>): SQL => {
    const filterQuery = constructFilterQuery(filter);
    return sql('SELECT data FROM %I %s', collectionName, where(filterQuery));
  },
  countDocuments: <T>(filter: PongoFilter<T>): SQL => {
    const filterQuery = constructFilterQuery(filter);
    return sql(
      'SELECT COUNT(1) as count FROM %I %s',
      collectionName,
      where(filterQuery),
    );
  },
  rename: (newName: string): SQL =>
    sql('ALTER TABLE %I RENAME TO %I', collectionName, newName),
  drop: (targetName: string = collectionName): SQL =>
    sql('DROP TABLE IF EXISTS %I', targetName),
});

const where = (filter: string): SQL =>
  filter.length > 0 ? sql('WHERE %s', filter) : rawSql('');
