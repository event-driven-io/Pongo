import {
  rawSql,
  sql,
  sqlMigration,
  type SQL,
  type SQLMigration,
} from '@event-driven-io/dumbo';
import {
  expectedVersionValue,
  type DeleteOneOptions,
  type OptionalUnlessRequiredId,
  type PongoCollectionSQLBuilder,
  type PongoFilter,
  type PongoUpdate,
  type ReplaceOneOptions,
  type UpdateOneOptions,
  type UpsertOneOptions,
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
  insertOne: <T>(document: OptionalUnlessRequiredId<T>): SQL => {
    return sql(
      'INSERT INTO %I (_id, data) VALUES (%L, %L) ON CONFLICT(_id) DO NOTHING;',
      collectionName,
      document._id,
      JSON.stringify(document),
    );
  },
  insertMany: <T>(documents: OptionalUnlessRequiredId<T>[]): SQL => {
    const values = documents
      .map((doc) => sql('(%L, %L)', doc._id, JSON.stringify(doc)))
      .join(', ');
    return sql(
      `INSERT INTO %I (_id, data) VALUES %s 
      ON CONFLICT(_id) DO NOTHING
      RETURNING _id;`,
      collectionName,
      values,
    );
  },
  updateOne: <T>(
    filter: PongoFilter<T>,
    update: PongoUpdate<T>,
    options?: UpdateOneOptions,
  ): SQL => {
    const expectedVersion = options?.expectedVersion
      ? expectedVersionValue(options.expectedVersion)
      : null;

    const expectedVersionUpdate = expectedVersion
      ? { _version: expectedVersionValue(expectedVersion) }
      : {};

    const filterQuery = constructFilterQuery<T>({
      ...expectedVersionUpdate,
      ...filter,
    });
    const updateQuery = buildUpdateQuery(update);

    return expectedVersion
      ? sql(
          `WITH cte AS (
        SELECT 
          _id, 
          CASE WHEN _version = %L THEN 1 ELSE 0 END AS matched,  
          1 as modified, 
        FROM %I %s LIMIT 1
      )
      UPDATE %I 
      SET data = %s 
      FROM cte 
      WHERE %I._id = cte._id AND %I._version = %L
      RETURNING cte.matched, cte.modified;`,
          expectedVersion,
          collectionName,
          where(filterQuery),
          collectionName,
          updateQuery,
          collectionName,
          expectedVersion,
        )
      : sql(
          `WITH cte AS (
      SELECT 
        _id, 
        1 as matched, 
        1 as modified 
      FROM %I %s LIMIT 1
    )
    UPDATE %I 
    SET data = %s 
    FROM cte 
    WHERE %I._id = cte._id
    RETURNING cte.matched, cte.modified;`,
          collectionName,
          where(filterQuery),
          collectionName,
          updateQuery,
          collectionName,
        );
  },
  upsertOne: <T>(
    filter: PongoFilter<T>,
    update: PongoUpdate<T>,
    options?: UpsertOneOptions,
  ): SQL => {
    const expectedVersionUpdate = options?.expectedVersion
      ? { _version: expectedVersionValue(options.expectedVersion) }
      : {};

    const filterQuery = constructFilterQuery<T>({
      ...expectedVersionUpdate,
      ...filter,
    });
    const updateQuery = buildUpdateQuery(update);

    return sql(
      `WITH cte AS (
        SELECT _id FROM %I %s LIMIT 1
      )
      UPDATE %I SET data = %s FROM cte WHERE %I._id = cte._id;`,
      collectionName,
      where(filterQuery),
      collectionName,
      updateQuery,
      collectionName,
    );
  },
  replaceOne: <T>(
    filter: PongoFilter<T>,
    document: WithoutId<T>,
    options?: ReplaceOneOptions,
  ): SQL => {
    const expectedVersion = options?.expectedVersion
      ? expectedVersionValue(options.expectedVersion)
      : null;

    const expectedVersionUpdate = expectedVersion
      ? { _version: expectedVersionValue(expectedVersion) }
      : {};

    const filterQuery = constructFilterQuery<T>({
      ...expectedVersionUpdate,
      ...filter,
    });

    return expectedVersion
      ? sql(
          `WITH cte AS (
        SELECT 
          _id, 
          CASE WHEN _version = %L THEN 1 ELSE 0 END AS matched,  
          1 as modified, 
        FROM %I %s LIMIT 1
      )
      UPDATE %I 
      SET data = %L || jsonb_build_object('_id', data->>'_id')
      FROM cte 
      WHERE %I._id = cte._id AND %I._version = %L
      RETURNING cte.matched, cte.modified;`,
          expectedVersion,
          collectionName,
          where(filterQuery),
          collectionName,
          JSON.stringify(document),
          collectionName,
          expectedVersion,
        )
      : sql(
          `WITH cte AS (
      SELECT 
        _id, 
        1 as matched, 
        1 as modified 
      FROM %I %s LIMIT 1
    )
    UPDATE %I 
    SET data = %L || jsonb_build_object('_id', data->>'_id')
    FROM cte 
    WHERE %I._id = cte._id
    RETURNING cte.matched, cte.modified;`,
          collectionName,
          where(filterQuery),
          collectionName,
          JSON.stringify(document),
          collectionName,
        );
  },
  updateMany: <T>(filter: PongoFilter<T>, update: PongoUpdate<T>): SQL => {
    const filterQuery = constructFilterQuery(filter);
    const updateQuery = buildUpdateQuery(update);

    return sql(
      'UPDATE %I SET data = %s %s;',
      collectionName,
      updateQuery,
      where(filterQuery),
    );
  },
  deleteOne: <T>(filter: PongoFilter<T>, options?: DeleteOneOptions): SQL => {
    const expectedVersion = options?.expectedVersion
      ? expectedVersionValue(options.expectedVersion)
      : null;

    const expectedVersionUpdate = expectedVersion
      ? { _version: expectedVersionValue(expectedVersion) }
      : {};

    const filterQuery = constructFilterQuery<T>({
      ...expectedVersionUpdate,
      ...filter,
    });

    return expectedVersion
      ? sql(
          `WITH cte AS (
        SELECT 
          _id, 
          CASE WHEN _version = %L THEN 1 ELSE 0 END AS matched,  
          1 as deleted, 
        FROM %I %s LIMIT 1
      )
      DELETE FROM %I
      USING cte
      WHERE %I._id = cte._id AND %I._version = %L
      RETURNING cte.matched, cte.deleted;`,
          expectedVersion,
          collectionName,
          where(filterQuery),
          collectionName,
          collectionName,
          collectionName,
          expectedVersion,
        )
      : sql(
          `WITH cte AS (
      SELECT 
        _id, 
        1 as matched, 
        1 as deleted 
      FROM %I %s LIMIT 1
    )
    DELETE FROM %I
    USING cte
    WHERE %I._id = cte._id
    RETURNING cte.matched, cte.deleted;`,
          collectionName,
          where(filterQuery),
          collectionName,
          collectionName,
        );
  },
  deleteMany: <T>(filter: PongoFilter<T>): SQL => {
    const filterQuery = constructFilterQuery(filter);
    return sql('DELETE FROM %I %s', collectionName, where(filterQuery));
  },
  findOne: <T>(filter: PongoFilter<T>): SQL => {
    const filterQuery = constructFilterQuery(filter);
    return sql(
      'SELECT data FROM %I %s LIMIT 1;',
      collectionName,
      where(filterQuery),
    );
  },
  find: <T>(filter: PongoFilter<T>): SQL => {
    const filterQuery = constructFilterQuery(filter);
    return sql('SELECT data FROM %I %s;', collectionName, where(filterQuery));
  },
  countDocuments: <T>(filter: PongoFilter<T>): SQL => {
    const filterQuery = constructFilterQuery(filter);
    return sql(
      'SELECT COUNT(1) as count FROM %I %s;',
      collectionName,
      where(filterQuery),
    );
  },
  rename: (newName: string): SQL =>
    sql('ALTER TABLE %I RENAME TO %I;', collectionName, newName),
  drop: (targetName: string = collectionName): SQL =>
    sql('DROP TABLE IF EXISTS %I', targetName),
});

const where = (filter: string): SQL =>
  filter.length > 0 ? sql('WHERE %s', filter) : rawSql('');
