import {
  isSQL,
  JSONSerializer,
  SQL,
  sqlMigration,
} from '@event-driven-io/dumbo';
import {
  expectedVersionValue,
  type DeleteOneOptions,
  type FindOptions,
  type OptionalUnlessRequiredIdAndVersion,
  type PongoCollectionSQLBuilder,
  type PongoFilter,
  type PongoUpdate,
  type ReplaceOneOptions,
  type UpdateOneOptions,
  type WithoutId,
} from '../../../../core';
import { constructFilterQuery } from './filter';
import { buildUpdateQuery } from './update';

const createCollection = (collectionName: string): SQL =>
  SQL`
    CREATE TABLE IF NOT EXISTS ${SQL.identifier(collectionName)} (
      _id           TEXT           PRIMARY KEY, 
      data          JSONB          NOT NULL, 
      metadata      JSONB          NOT NULL     DEFAULT '{}',
      _version      BIGINT         NOT NULL     DEFAULT 1,
      _partition    TEXT           NOT NULL     DEFAULT 'png_global',
      _archived     BOOLEAN        NOT NULL     DEFAULT FALSE,
      _created      TIMESTAMPTZ    NOT NULL     DEFAULT now(),
      _updated      TIMESTAMPTZ    NOT NULL     DEFAULT now()
  )`;

export const pongoCollectionPostgreSQLMigrations = (collectionName: string) => [
  sqlMigration(`pongoCollection:${collectionName}:001:createtable`, [
    createCollection(collectionName),
  ]),
];

export const postgresSQLBuilder = (
  collectionName: string,
): PongoCollectionSQLBuilder => ({
  createCollection: (): SQL => createCollection(collectionName),
  insertOne: <T>(document: OptionalUnlessRequiredIdAndVersion<T>): SQL => {
    const serialized = JSONSerializer.serialize(document);
    const id = document._id;
    const version = document._version ?? 1n;

    return SQL`
      INSERT INTO ${SQL.identifier(collectionName)} (_id, data, _version) 
      VALUES (${id}, ${serialized}, ${version}) ON CONFLICT(_id) DO NOTHING;`;
  },
  insertMany: <T>(documents: OptionalUnlessRequiredIdAndVersion<T>[]): SQL => {
    const values = SQL.merge(
      documents.map(
        (doc) =>
          SQL`(${doc._id}, ${JSONSerializer.serialize(doc)}, ${doc._version ?? 1n})`,
      ),
      ',',
    );

    return SQL`
      INSERT INTO ${SQL.identifier(collectionName)} (_id, data, _version) VALUES ${values}
      ON CONFLICT(_id) DO NOTHING
      RETURNING _id;`;
  },
  updateOne: <T>(
    filter: PongoFilter<T> | SQL,
    update: PongoUpdate<T> | SQL,
    options?: UpdateOneOptions,
  ): SQL => {
    const expectedVersion = expectedVersionValue(options?.expectedVersion);
    const expectedVersionUpdate =
      expectedVersion != null
        ? SQL`AND ${SQL.identifier(collectionName)}._version = ${expectedVersion}`
        : SQL``;

    const filterQuery = isSQL(filter) ? filter : constructFilterQuery(filter);
    const updateQuery = isSQL(update) ? update : buildUpdateQuery(update);

    return SQL`
      WITH existing AS (
        SELECT _id, _version as current_version
        FROM ${SQL.identifier(collectionName)} ${where(filterQuery)}
        LIMIT 1
      ),
      updated AS (
        UPDATE ${SQL.identifier(collectionName)} 
        SET 
          data = ${updateQuery} || jsonb_build_object('_id', ${SQL.identifier(collectionName)}._id) || jsonb_build_object('_version', (_version + 1)::text),
          _version = _version + 1
        FROM existing 
        WHERE ${SQL.identifier(collectionName)}._id = existing._id ${expectedVersionUpdate}
        RETURNING ${SQL.identifier(collectionName)}._id, ${SQL.identifier(collectionName)}._version
      )
      SELECT 
        existing._id,
        COALESCE(updated._version, existing.current_version) AS version,
        COUNT(existing._id) over() AS matched,
        COUNT(updated._id) over() AS modified
      FROM existing
      LEFT JOIN updated 
      ON existing._id = updated._id;`;
  },
  replaceOne: <T>(
    filter: PongoFilter<T> | SQL,
    document: WithoutId<T>,
    options?: ReplaceOneOptions,
  ): SQL => {
    const expectedVersion = expectedVersionValue(options?.expectedVersion);
    const expectedVersionUpdate =
      expectedVersion != null
        ? SQL`AND ${SQL.identifier(collectionName)}._version = ${expectedVersion}`
        : SQL``;

    const filterQuery = isSQL(filter) ? filter : constructFilterQuery(filter);

    return SQL`
      WITH existing AS (
        SELECT _id, _version as current_version
        FROM ${SQL.identifier(collectionName)} ${where(filterQuery)}
        LIMIT 1
      ),
      updated AS (
        UPDATE ${SQL.identifier(collectionName)}        
        SET 
          data = ${JSONSerializer.serialize(document)} || jsonb_build_object('_id', ${SQL.identifier(collectionName)}._id) || jsonb_build_object('_version', (_version + 1)::text),
          _version = _version + 1
        FROM existing 
        WHERE ${SQL.identifier(collectionName)}._id = existing._id ${expectedVersionUpdate}
        RETURNING ${SQL.identifier(collectionName)}._id, ${SQL.identifier(collectionName)}._version
      )
      SELECT 
        existing._id,
        COALESCE(updated._version, existing.current_version) AS version,
        COUNT(existing._id) over() AS matched,
        COUNT(updated._id) over() AS modified
      FROM existing
      LEFT JOIN updated 
      ON existing._id = updated._id;`;
  },
  updateMany: <T>(
    filter: PongoFilter<T> | SQL,
    update: PongoUpdate<T> | SQL,
  ): SQL => {
    const filterQuery = isSQL(filter) ? filter : constructFilterQuery(filter);
    const updateQuery = isSQL(update) ? update : buildUpdateQuery(update);

    return SQL`
      UPDATE ${SQL.identifier(collectionName)} 
      SET 
        data = ${updateQuery} || jsonb_build_object('_version', (_version + 1)::text),
        _version = _version + 1
      ${where(filterQuery)};`;
  },
  deleteOne: <T>(
    filter: PongoFilter<T> | SQL,
    options?: DeleteOneOptions,
  ): SQL => {
    const expectedVersion = expectedVersionValue(options?.expectedVersion);
    const expectedVersionUpdate =
      expectedVersion != null
        ? SQL`AND ${SQL.identifier(collectionName)}._version = ${expectedVersion}`
        : SQL``;

    const filterQuery = isSQL(filter) ? filter : constructFilterQuery(filter);

    return SQL`
      WITH existing AS (
        SELECT _id
        FROM ${SQL.identifier(collectionName)} ${where(filterQuery)}
        LIMIT 1
      ),
      deleted AS (
        DELETE FROM ${SQL.identifier(collectionName)}
        USING existing
        WHERE ${SQL.identifier(collectionName)}._id = existing._id ${expectedVersionUpdate}
        RETURNING ${SQL.identifier(collectionName)}._id
      )
      SELECT 
        existing._id,
        COUNT(existing._id) over() AS matched,
        COUNT(deleted._id) over() AS deleted
      FROM existing
      LEFT JOIN deleted 
      ON existing._id = deleted._id;`;
  },
  deleteMany: <T>(filter: PongoFilter<T> | SQL): SQL => {
    const filterQuery = isSQL(filter) ? filter : constructFilterQuery(filter);

    return SQL`DELETE FROM ${SQL.identifier(collectionName)} ${where(filterQuery)}`;
  },
  findOne: <T>(filter: PongoFilter<T> | SQL): SQL => {
    const filterQuery = isSQL(filter) ? filter : constructFilterQuery(filter);

    return SQL`SELECT data, _version FROM ${SQL.identifier(collectionName)} ${where(filterQuery)} LIMIT 1;`;
  },
  find: <T>(filter: PongoFilter<T> | SQL, options?: FindOptions): SQL => {
    const filterQuery = isSQL(filter) ? filter : constructFilterQuery(filter);
    const query: SQL[] = [];

    query.push(
      SQL`SELECT data, _version FROM ${SQL.identifier(collectionName)}`,
    );

    query.push(where(filterQuery));

    if (options?.limit) {
      query.push(SQL`LIMIT ${options.limit}`);
    }

    if (options?.skip) {
      query.push(SQL`OFFSET ${options.skip}`);
    }

    return SQL.merge([...query, SQL`;`]);
  },
  countDocuments: <T>(filter: PongoFilter<T> | SQL): SQL => {
    const filterQuery = SQL.check.isSQL(filter)
      ? filter
      : constructFilterQuery(filter);
    return SQL`SELECT COUNT(1) as count FROM ${SQL.identifier(collectionName)} ${where(filterQuery)};`;
  },
  rename: (newName: string): SQL =>
    SQL`ALTER TABLE ${SQL.identifier(collectionName)} RENAME TO ${SQL.identifier(newName)};`,
  drop: (targetName: string = collectionName): SQL =>
    SQL`DROP TABLE IF EXISTS ${SQL.identifier(targetName)}`,
});

const where = (filterQuery: SQL): SQL =>
  SQL.check.isEmpty(filterQuery)
    ? SQL.EMPTY
    : SQL.merge([SQL`WHERE `, filterQuery]);
