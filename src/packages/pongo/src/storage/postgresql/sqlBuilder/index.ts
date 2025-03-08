import {
  isSQL,
  JSONSerializer,
  rawSql,
  sql,
  sqlMigration,
  type SQL,
  type SQLMigration,
} from '@event-driven-io/dumbo';
import {
  expectedVersionValue,
  type DeleteOneOptions,
  type OptionalUnlessRequiredIdAndVersion,
  type PongoCollectionSQLBuilder,
  type PongoFilter,
  type PongoUpdate,
  type ReplaceOneOptions,
  type UpdateOneOptions,
  type WithoutId,
} from '../../../core';
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
  insertOne: <T>(document: OptionalUnlessRequiredIdAndVersion<T>): SQL => {
    return sql(
      'INSERT INTO %I (_id, data, _version) VALUES (%L, %L, %L) ON CONFLICT(_id) DO NOTHING;',
      collectionName,
      document._id,
      JSONSerializer.serialize(document),
      document._version ?? 1n,
    );
  },
  insertMany: <T>(documents: OptionalUnlessRequiredIdAndVersion<T>[]): SQL => {
    const values = documents
      .map((doc) =>
        sql(
          '(%L, %L, %L)',
          doc._id,
          JSONSerializer.serialize(doc),
          doc._version ?? 1n,
        ),
      )
      .join(', ');
    return sql(
      `INSERT INTO %I (_id, data, _version) VALUES %s 
      ON CONFLICT(_id) DO NOTHING
      RETURNING _id;`,
      collectionName,
      values,
    );
  },
  updateOne: <T>(
    filter: PongoFilter<T> | SQL,
    update: PongoUpdate<T> | SQL,
    options?: UpdateOneOptions,
  ): SQL => {
    const expectedVersion = expectedVersionValue(options?.expectedVersion);
    const expectedVersionUpdate =
      expectedVersion != null ? 'AND %I._version = %L' : '';
    const expectedVersionParams =
      expectedVersion != null ? [collectionName, expectedVersion] : [];

    const filterQuery = isSQL(filter) ? filter : constructFilterQuery(filter);
    const updateQuery = isSQL(update) ? update : buildUpdateQuery(update);

    return sql(
      `WITH existing AS (
        SELECT _id, _version as current_version
        FROM %I %s 
        LIMIT 1
      ),
      updated AS (
        UPDATE %I 
        SET 
          data = %s || jsonb_build_object('_id', %I._id) || jsonb_build_object('_version', (_version + 1)::text),
          _version = _version + 1
        FROM existing 
        WHERE %I._id = existing._id ${expectedVersionUpdate}
        RETURNING %I._id, %I._version
      )
      SELECT 
        existing._id,
        COALESCE(updated._version, existing.current_version) AS version,
        COUNT(existing._id) over() AS matched,
        COUNT(updated._id) over() AS modified
      FROM existing
      LEFT JOIN updated 
      ON existing._id = updated._id;`,
      collectionName,
      where(filterQuery),
      collectionName,
      updateQuery,
      collectionName,
      collectionName,
      ...expectedVersionParams,
      collectionName,
      collectionName,
    );
  },
  replaceOne: <T>(
    filter: PongoFilter<T> | SQL,
    document: WithoutId<T>,
    options?: ReplaceOneOptions,
  ): SQL => {
    const expectedVersion = expectedVersionValue(options?.expectedVersion);
    const expectedVersionUpdate =
      expectedVersion != null ? 'AND %I._version = %L' : '';
    const expectedVersionParams =
      expectedVersion != null ? [collectionName, expectedVersion] : [];

    const filterQuery = isSQL(filter) ? filter : constructFilterQuery(filter);

    return sql(
      `WITH existing AS (
        SELECT _id, _version as current_version
        FROM %I %s 
        LIMIT 1
      ),
      updated AS (
        UPDATE %I        
        SET 
          data = %L || jsonb_build_object('_id', %I._id) || jsonb_build_object('_version', (_version + 1)::text),
          _version = _version + 1
        FROM existing 
        WHERE %I._id = existing._id ${expectedVersionUpdate}
        RETURNING %I._id, %I._version
      )
      SELECT 
        existing._id,
        COALESCE(updated._version, existing.current_version) AS version,
        COUNT(existing._id) over() AS matched,
        COUNT(updated._id) over() AS modified
      FROM existing
      LEFT JOIN updated 
      ON existing._id = updated._id;`,
      collectionName,
      where(filterQuery),
      collectionName,
      JSONSerializer.serialize(document),
      collectionName,
      collectionName,
      ...expectedVersionParams,
      collectionName,
      collectionName,
    );
  },
  updateMany: <T>(
    filter: PongoFilter<T> | SQL,
    update: PongoUpdate<T> | SQL,
  ): SQL => {
    const filterQuery = isSQL(filter) ? filter : constructFilterQuery(filter);
    const updateQuery = isSQL(update) ? update : buildUpdateQuery(update);

    return sql(
      `UPDATE %I 
      SET 
        data = %s || jsonb_build_object('_version', (_version + 1)::text),
        _version = _version + 1
      %s;`,
      collectionName,
      updateQuery,
      where(filterQuery),
    );
  },
  deleteOne: <T>(
    filter: PongoFilter<T> | SQL,
    options?: DeleteOneOptions,
  ): SQL => {
    const expectedVersion = expectedVersionValue(options?.expectedVersion);
    const expectedVersionUpdate =
      expectedVersion != null ? 'AND %I._version = %L' : '';
    const expectedVersionParams =
      expectedVersion != null ? [collectionName, expectedVersion] : [];

    const filterQuery = isSQL(filter) ? filter : constructFilterQuery(filter);

    return sql(
      `WITH existing AS (
        SELECT _id
        FROM %I %s 
        LIMIT 1
      ),
      deleted AS (
        DELETE FROM %I
        USING existing
        WHERE %I._id = existing._id ${expectedVersionUpdate}
        RETURNING %I._id
      )
      SELECT 
        existing._id,
        COUNT(existing._id) over() AS matched,
        COUNT(deleted._id) over() AS deleted
      FROM existing
      LEFT JOIN deleted 
      ON existing._id = deleted._id;`,
      collectionName,
      where(filterQuery),
      collectionName,
      collectionName,
      ...expectedVersionParams,
      collectionName,
    );
  },
  deleteMany: <T>(filter: PongoFilter<T> | SQL): SQL => {
    const filterQuery = isSQL(filter) ? filter : constructFilterQuery(filter);

    return sql('DELETE FROM %I %s', collectionName, where(filterQuery));
  },
  findOne: <T>(filter: PongoFilter<T> | SQL): SQL => {
    const filterQuery = isSQL(filter) ? filter : constructFilterQuery(filter);

    return sql(
      'SELECT data FROM %I %s LIMIT 1;',
      collectionName,
      where(filterQuery),
    );
  },
  find: <T>(filter: PongoFilter<T> | SQL): SQL => {
    const filterQuery = isSQL(filter) ? filter : constructFilterQuery(filter);
    return sql('SELECT data FROM %I %s;', collectionName, where(filterQuery));
  },
  countDocuments: <T>(filter: PongoFilter<T> | SQL): SQL => {
    const filterQuery = isSQL(filter) ? filter : constructFilterQuery(filter);
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
