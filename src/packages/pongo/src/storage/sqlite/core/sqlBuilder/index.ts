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
      data          TEXT           NOT NULL,
      metadata      TEXT           NOT NULL     DEFAULT '{}',
      _version      INTEGER        NOT NULL     DEFAULT 1,
      _partition    TEXT           NOT NULL     DEFAULT 'png_global',
      _archived     INTEGER        NOT NULL     DEFAULT 0,
      _created      TEXT           NOT NULL     DEFAULT (datetime('now')),
      _updated      TEXT           NOT NULL     DEFAULT (datetime('now'))
  )`;

export const pongoCollectionSQLiteMigrations = (collectionName: string) => [
  sqlMigration(`pongoCollection:${collectionName}:001:createtable`, [
    createCollection(collectionName),
  ]),
];

export const sqliteSQLBuilder = (
  collectionName: string,
): PongoCollectionSQLBuilder => ({
  createCollection: (): SQL => createCollection(collectionName),
  insertOne: <T>(document: OptionalUnlessRequiredIdAndVersion<T>): SQL => {
    const serialized = JSONSerializer.serialize(document);
    const id = document._id;
    const version = document._version ?? 1n;

    return SQL`
      INSERT OR IGNORE INTO ${SQL.identifier(collectionName)} (_id, data, _version)
      VALUES (${id}, ${serialized}, ${version});`;
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
      INSERT OR IGNORE INTO ${SQL.identifier(collectionName)} (_id, data, _version) VALUES ${values}
      RETURNING _id;`;
  },
  updateOne: <T>(
    filter: PongoFilter<T> | SQL,
    update: PongoUpdate<T> | SQL,
    options?: UpdateOneOptions,
  ): SQL => {
    const expectedVersion = expectedVersionValue(options?.expectedVersion);
    const expectedVersionCheck =
      expectedVersion != null ? SQL`AND _version = ${expectedVersion}` : SQL``;

    const filterQuery = isSQL(filter) ? filter : constructFilterQuery(filter);
    const updateQuery = isSQL(update) ? update : buildUpdateQuery(update);

    // SQLite needs to handle both cases: when a row matches and when it doesn't
    return SQL`
      UPDATE ${SQL.identifier(collectionName)}
      SET
        data = json_set(
          json_set(${updateQuery}, '$._id', _id),
          '$._version',
          CAST((_version + 1) AS TEXT)
        ),
        _version = _version + 1,
        _updated = datetime('now')
      WHERE _id = (
        SELECT _id FROM ${SQL.identifier(collectionName)}
        ${where(filterQuery)}
        LIMIT 1
      ) ${expectedVersionCheck}
      RETURNING
        _id,
        _version as version,
        1 as matched,
        1 as modified;`;
  },
  replaceOne: <T>(
    filter: PongoFilter<T> | SQL,
    document: WithoutId<T>,
    options?: ReplaceOneOptions,
  ): SQL => {
    const expectedVersion = expectedVersionValue(options?.expectedVersion);
    const expectedVersionCheck =
      expectedVersion != null ? SQL`AND _version = ${expectedVersion}` : SQL``;

    const filterQuery = isSQL(filter) ? filter : constructFilterQuery(filter);

    return SQL`
      UPDATE ${SQL.identifier(collectionName)}
      SET
        data = json_set(
          json_set(${JSONSerializer.serialize(document)}, '$._id', _id),
          '$._version',
          CAST((_version + 1) AS TEXT)
        ),
        _version = _version + 1,
        _updated = datetime('now')
      WHERE _id = (
        SELECT _id FROM ${SQL.identifier(collectionName)}
        ${where(filterQuery)}
        LIMIT 1
      ) ${expectedVersionCheck}
      RETURNING
        _id,
        _version AS version,
        1 AS matched,
        1 AS modified;`;
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
        data = json_set(${updateQuery}, '$._version', CAST((_version + 1) AS TEXT)),
        _version = _version + 1,
        _updated = datetime('now')
      ${where(filterQuery)};`;
  },
  deleteOne: <T>(
    filter: PongoFilter<T> | SQL,
    options?: DeleteOneOptions,
  ): SQL => {
    const expectedVersion = expectedVersionValue(options?.expectedVersion);
    const expectedVersionCheck =
      expectedVersion != null ? SQL`AND _version = ${expectedVersion}` : SQL``;

    const filterQuery = isSQL(filter) ? filter : constructFilterQuery(filter);

    return SQL`
      DELETE FROM ${SQL.identifier(collectionName)}
      WHERE _id = (
        SELECT _id FROM ${SQL.identifier(collectionName)}
        ${where(filterQuery)}
        LIMIT 1
      ) ${expectedVersionCheck}
      RETURNING
        _id,
        1 AS matched,
        1 AS deleted;`;
  },
  deleteMany: <T>(filter: PongoFilter<T> | SQL): SQL => {
    const filterQuery = isSQL(filter) ? filter : constructFilterQuery(filter);

    return SQL`DELETE FROM ${SQL.identifier(collectionName)} ${where(filterQuery)}`;
  },
  findOne: <T>(filter: PongoFilter<T> | SQL): SQL => {
    const filterQuery = isSQL(filter) ? filter : constructFilterQuery(filter);

    return SQL`SELECT data FROM ${SQL.identifier(collectionName)} ${where(filterQuery)} LIMIT 1;`;
  },
  find: <T>(filter: PongoFilter<T> | SQL, options?: FindOptions): SQL => {
    const filterQuery = isSQL(filter) ? filter : constructFilterQuery(filter);
    const query: SQL[] = [];

    query.push(SQL`SELECT data FROM ${SQL.identifier(collectionName)}`);

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
