import {
  createTableSQL,
  isSQL,
  JSONParam,
  SQL,
  SQLTableReference,
  type JSONSerializer,
} from '@event-driven-io/dumbo';
import { SQLiteJSON } from '@event-driven-io/dumbo/sqlite';
import {
  expectedVersionPredicate,
  type DeleteOneOptions,
  type ExpectedDocumentVersion,
  type FindOptions,
  type OptionalUnlessRequiredIdAndVersion,
  type PongoCollectionComponent,
  type PongoCollectionSQLBuilder,
  type PongoFilter,
  type PongoUpdate,
  type ReplaceOneOptions,
  type UpdateOneOptions,
  type WithId,
  type WithIdAndVersion,
  type WithoutId,
} from '../../../../core';
import { constructFilterQuery } from './filter';
import { buildUpdateQuery } from './update';

const versionCheckClause = (
  expectedVersion: ExpectedDocumentVersion | undefined,
): SQL => {
  const predicate = expectedVersionPredicate(expectedVersion);
  return predicate.operator === 'none'
    ? SQL.EMPTY
    : SQL`AND _version = ${predicate.value}`;
};

export const sqliteSQLBuilder = (
  collection: PongoCollectionComponent,
  serializer: JSONSerializer,
): PongoCollectionSQLBuilder => {
  const tableReference = collection.tableReference;

  return {
    createCollection: (): SQL[] => [createTableSQL(collection)],
    insertOne: <T>(document: OptionalUnlessRequiredIdAndVersion<T>): SQL => {
      const serialized = JSONParam.document(document, serializer);
      const id = document._id;
      const version = document._version ?? 1n;

      return SQL`
      INSERT OR IGNORE INTO ${tableReference} (_id, data, _version)
      VALUES (${id}, ${serialized}, ${version})
      RETURNING _id;`;
    },
    insertMany: <T>(
      documents: OptionalUnlessRequiredIdAndVersion<T>[],
    ): SQL => {
      const values = SQL.merge(
        documents.map(
          (doc) =>
            SQL`(${doc._id}, ${JSONParam.document(doc, serializer)}, ${doc._version ?? 1n})`,
        ),
        ',',
      );

      return SQL`
      INSERT OR IGNORE INTO ${tableReference} (_id, data, _version) VALUES ${values}
      RETURNING _id;`;
    },
    insertOrReplace: <T>(documents: Array<WithId<T>>): SQL => {
      const col = tableReference;
      const values = SQL.merge(
        documents.map(
          (d) =>
            SQL`(${d._id}, json_patch(${JSONParam.document(d, serializer)}, json_object('_id', ${d._id}, '_version', '1')), 1)`,
        ),
        ',',
      );

      return SQL`
      INSERT INTO ${col} (_id, data, _version)
      VALUES ${values}
      ON CONFLICT(_id) DO UPDATE SET
        data = json_patch(excluded.data, json_object('_id', ${col}._id, '_version', cast(${col}._version + 1 as TEXT))),
        _version = ${col}._version + 1
      RETURNING _id, cast(_version as TEXT) as version;`;
    },
    updateOne: <T>(
      filter: PongoFilter<T> | SQL,
      update: PongoUpdate<T> | SQL,
      options?: UpdateOneOptions,
    ): SQL => {
      const expectedVersionCheck = versionCheckClause(options?.expectedVersion);

      const filterQuery = isSQL(filter)
        ? filter
        : constructFilterQuery(filter, serializer);
      const updateQuery = isSQL(update)
        ? update
        : buildUpdateQuery(update, serializer);

      return SQL`
      UPDATE ${tableReference}
      SET
        data = json_patch(${updateQuery}, json_object('_id', _id, '_version', cast(_version + 1 as TEXT))),
        _version = _version + 1,
        _updated = datetime('now')
      WHERE _id = (
        SELECT _id FROM ${tableReference}
        ${where(filterQuery)}
        LIMIT 1
      ) ${expectedVersionCheck}
      RETURNING
        _id,
        cast(_version as TEXT) as version,
        1 as matched,
        1 as modified;`;
    },
    replaceOne: <T>(
      filter: PongoFilter<T> | SQL,
      document: WithoutId<T>,
      options?: ReplaceOneOptions,
    ): SQL => {
      const expectedVersionCheck = versionCheckClause(options?.expectedVersion);

      const filterQuery = isSQL(filter)
        ? filter
        : constructFilterQuery(filter, serializer);

      return SQL`
      UPDATE ${tableReference}
      SET
        data = json_patch(${JSONParam.document(document, serializer)}, json_object('_id', _id, '_version', cast(_version + 1 as TEXT))),
        _version = _version + 1,
        _updated = datetime('now')
      WHERE _id = (
        SELECT _id FROM ${tableReference}
        ${where(filterQuery)}
        LIMIT 1
      ) ${expectedVersionCheck}
      RETURNING
        _id,
        cast(_version as TEXT) AS version,
        1 AS matched,
        1 AS modified;`;
    },
    updateMany: <T>(
      filter: PongoFilter<T> | SQL,
      update: PongoUpdate<T> | SQL,
    ): SQL => {
      const filterQuery = isSQL(filter)
        ? filter
        : constructFilterQuery(filter, serializer);
      const updateQuery = isSQL(update)
        ? update
        : buildUpdateQuery(update, serializer);

      return SQL`
      UPDATE ${tableReference}
      SET
        data = json_patch(${updateQuery}, json_object('_version', cast(_version + 1 as TEXT))),
        _version = _version + 1,
        _updated = datetime('now')
      ${where(filterQuery)}
      RETURNING _id;`;
    },
    deleteOne: <T>(
      filter: PongoFilter<T> | SQL,
      options?: DeleteOneOptions,
    ): SQL => {
      const expectedVersionCheck = versionCheckClause(options?.expectedVersion);

      const filterQuery = isSQL(filter)
        ? filter
        : constructFilterQuery(filter, serializer);

      return SQL`
      DELETE FROM ${tableReference}
      WHERE _id = (
        SELECT _id FROM ${tableReference}
        ${where(filterQuery)}
        LIMIT 1
      ) ${expectedVersionCheck}
      RETURNING
        _id,
        1 AS matched,
        1 AS deleted;`;
    },
    deleteMany: <T>(filter: PongoFilter<T> | SQL): SQL => {
      const filterQuery = isSQL(filter)
        ? filter
        : constructFilterQuery(filter, serializer);

      return SQL`DELETE FROM ${tableReference} ${where(filterQuery)} RETURNING _id`;
    },
    replaceMany: <T>(
      documents: Array<WithIdAndVersion<T>> | Array<WithId<T>>,
    ): SQL => {
      const col = tableReference;
      const hasVersions = documents.some(
        (d) => '_version' in d && d._version !== undefined,
      );

      if (hasVersions) {
        const values = SQL.merge(
          documents.map((d) => {
            const expectedVersion = (d as WithIdAndVersion<T>)._version;
            return expectedVersion !== undefined
              ? SQL`(${d._id}, ${JSONParam.document(d, serializer)}, ${expectedVersion})`
              : SQL`(${d._id}, ${JSONParam.document(d, serializer)}, NULL)`;
          }),
          ',',
        );
        return SQL`
        WITH replacements(_id, data, expected_version) AS (
          VALUES ${values}
        )
        UPDATE ${col}
        SET
          data = json_patch(r.data, json_object('_id', ${col}._id, '_version', cast(${col}._version + 1 as TEXT))),
          _version = ${col}._version + 1,
          _updated = datetime('now')
        FROM replacements r
        WHERE ${col}._id = r._id AND (r.expected_version IS NULL OR ${col}._version = r.expected_version)
        RETURNING ${col}._id, cast(${col}._version as TEXT) as version;`;
      }

      const values = SQL.merge(
        documents.map(
          (d) => SQL`(${d._id}, ${JSONParam.document(d, serializer)})`,
        ),
        ',',
      );
      return SQL`
      WITH replacements(_id, data) AS (
        VALUES ${values}
      )
      UPDATE ${col}
      SET
        data = json_patch(r.data, json_object('_id', ${col}._id, '_version', cast(${col}._version + 1 as TEXT))),
        _version = ${col}._version + 1,
        _updated = datetime('now')
      FROM replacements r
      WHERE ${col}._id = r._id
      RETURNING ${col}._id, cast(${col}._version as TEXT) as version;`;
    },
    deleteManyByIds: (ids: Array<{ _id: string; _version?: bigint }>): SQL => {
      const hasVersions = ids.some((d) => d._version !== undefined);

      if (hasVersions) {
        const values = SQL.merge(
          ids.map((d) => SQL`(${d._id}, ${d._version ?? 0n})`),
          ',',
        );

        return SQL`
        WITH targets(_id, expected_version) AS (
          VALUES ${values}
        )
        DELETE FROM ${tableReference}
        WHERE _id IN (SELECT _id FROM targets)
          AND _version = (SELECT expected_version FROM targets WHERE targets._id = ${tableReference}._id)
        RETURNING _id;`;
      }

      const idList = SQL.merge(
        ids.map((d) => SQL`${d._id}`),
        ',',
      );

      return SQL`
      DELETE FROM ${tableReference}
      WHERE _id IN (${idList})
      RETURNING _id;`;
    },
    findOne: <T>(filter: PongoFilter<T> | SQL): SQL => {
      const filterQuery = isSQL(filter)
        ? filter
        : constructFilterQuery(filter, serializer);

      return SQL`SELECT data, _id, _version FROM ${tableReference} ${where(filterQuery)} LIMIT 1;`;
    },
    find: <T>(filter: PongoFilter<T> | SQL, options?: FindOptions): SQL => {
      const filterQuery = isSQL(filter)
        ? filter
        : constructFilterQuery(filter, serializer);
      const query: SQL[] = [];

      query.push(SQL`SELECT data, _id, _version FROM ${tableReference}`);

      query.push(where(filterQuery));

      if (options?.sort && Object.keys(options.sort).length > 0) {
        const clauses = Object.entries(options.sort).map(([field, dir]) => {
          // _id and _version are native columns, not JSON fields.
          const isMetadata = field === '_id' || field === '_version';
          const accessor = isMetadata
            ? SQL`${SQL.identifier(field)}`
            : SQL`json_extract(data, ${SQLiteJSON.path(field)})`;
          return dir === 1 ? SQL`${accessor} ASC` : SQL`${accessor} DESC`;
        });
        query.push(SQL`ORDER BY ${SQL.merge(clauses, ',')}`);
      }

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
        : constructFilterQuery(filter, serializer);
      return SQL`SELECT COUNT(1) as count FROM ${tableReference} ${where(filterQuery)};`;
    },
    rename: (newName: string): SQL => {
      const renamedTableReference = SQLTableReference.from({
        ...tableReference,
        tableName: newName,
      });
      return SQL`ALTER TABLE ${tableReference} RENAME TO ${renamedTableReference};`;
    },
    drop: (): SQL => SQL`DROP TABLE IF EXISTS ${tableReference}`,
  };
};

const where = (filterQuery: SQL): SQL =>
  SQL.check.isEmpty(filterQuery)
    ? SQL.EMPTY
    : SQL.merge([SQL`WHERE `, filterQuery]);
