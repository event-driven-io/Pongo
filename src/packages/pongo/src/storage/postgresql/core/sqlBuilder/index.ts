import type { JSONSerializer } from '@event-driven-io/dumbo';
import {
  dumboSchema,
  isSQL,
  JSONParam,
  SQL,
  sqlMigration,
} from '@event-driven-io/dumbo';
import { PostgreSQLJSON } from '@event-driven-io/dumbo/postgresql';
import {
  expectedVersionPredicate,
  type DeleteOneOptions,
  type ExpectedDocumentVersion,
  type FindOptions,
  type OptionalUnlessRequiredIdAndVersion,
  type PongoCollectionSchema,
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
  collection: SQL,
  expectedVersion: ExpectedDocumentVersion | undefined,
): SQL => {
  const predicate = expectedVersionPredicate(expectedVersion);
  return predicate.operator === 'none'
    ? SQL.EMPTY
    : SQL`AND ${collection}._version = ${predicate.value}`;
};

const collectionIdentity = (
  schemaOrName: PongoCollectionSchema | string,
): {
  databaseSchemaName?: string | undefined;
  migrationName: string;
  reference: SQL;
  tableName: string;
} => {
  const schema =
    typeof schemaOrName === 'string'
      ? {
          tableName: schemaOrName,
          databaseSchemaName: dumboSchema.schema.defaultName,
        }
      : schemaOrName;

  if (schema.databaseSchemaName === dumboSchema.schema.defaultName) {
    return {
      migrationName: schema.tableName,
      reference: SQL`${SQL.identifier(schema.tableName)}`,
      tableName: schema.tableName,
    };
  }

  return {
    databaseSchemaName: schema.databaseSchemaName,
    migrationName: `${schema.databaseSchemaName}:${schema.tableName}`,
    reference: SQL`${SQL.identifier(schema.databaseSchemaName)}.${SQL.identifier(schema.tableName)}`,
    tableName: schema.tableName,
  };
};

const createDatabaseSchema = (
  schemaOrName: PongoCollectionSchema | string,
): SQL | undefined => {
  if (
    typeof schemaOrName === 'string' ||
    schemaOrName.databaseSchemaName === dumboSchema.schema.defaultName
  ) {
    return undefined;
  }

  return SQL`CREATE SCHEMA IF NOT EXISTS ${SQL.identifier(schemaOrName.databaseSchemaName)}`;
};

const createCollection = (schemaOrName: PongoCollectionSchema | string): SQL =>
  SQL`
    CREATE TABLE IF NOT EXISTS ${collectionIdentity(schemaOrName).reference} (
      _id           TEXT           PRIMARY KEY,
      data          JSONB          NOT NULL,
      metadata      JSONB          NOT NULL     DEFAULT '{}',
      _version      BIGINT         NOT NULL     DEFAULT 1,
      _partition    TEXT           NOT NULL     DEFAULT 'png_global',
      _archived     BOOLEAN        NOT NULL     DEFAULT FALSE,
      _created      TIMESTAMPTZ    NOT NULL     DEFAULT now(),
      _updated      TIMESTAMPTZ    NOT NULL     DEFAULT now()
	  )`;

export const pongoCollectionPostgreSQLMigrations = (
  schemaOrName: PongoCollectionSchema | string,
) => {
  const collection = collectionIdentity(schemaOrName);
  const schemaMigration = createDatabaseSchema(schemaOrName);

  return [
    sqlMigration(
      `pongoCollection:${collection.migrationName}:001:createtable`,
      [
        ...(schemaMigration ? [schemaMigration] : []),
        createCollection(schemaOrName),
      ],
    ),
    ...(typeof schemaOrName === 'string' ? [] : schemaOrName.migrations),
  ];
};

export const postgresSQLBuilder = (
  schemaOrName: PongoCollectionSchema | string,
  serializer: JSONSerializer,
): PongoCollectionSQLBuilder => {
  const collection = collectionIdentity(schemaOrName);

  return {
    createCollection: (): SQL => createCollection(schemaOrName),
    insertOne: <T>(document: OptionalUnlessRequiredIdAndVersion<T>): SQL => {
      const serialized = JSONParam.document(document, serializer);
      const id = document._id;
      const version = document._version ?? 1n;

      return SQL`
      INSERT INTO ${collection.reference} (_id, data, _version)
      VALUES (${id}, ${serialized}, ${version}) ON CONFLICT(_id) DO NOTHING;`;
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
      INSERT INTO ${collection.reference} (_id, data, _version) VALUES ${values}
      ON CONFLICT(_id) DO NOTHING
      RETURNING _id;`;
    },
    insertOrReplace: <T>(documents: Array<WithId<T>>): SQL => {
      const col = collection.reference;
      const values = SQL.merge(
        documents.map(
          (d) =>
            SQL`(${d._id}::text, ${JSONParam.document(d, serializer)}::jsonb || jsonb_build_object('_id', ${d._id}::text) || jsonb_build_object('_version', '1'::text), 1::bigint)`,
        ),
        ',',
      );

      return SQL`
      INSERT INTO ${col} (_id, data, _version)
      VALUES ${values}
      ON CONFLICT(_id) DO UPDATE SET
        data = EXCLUDED.data
          || jsonb_build_object('_id', ${col}._id)
          || jsonb_build_object('_version', (${col}._version + 1)::text),
        _version = ${col}._version + 1
      RETURNING _id, _version AS version;`;
    },
    updateOne: <T>(
      filter: PongoFilter<T> | SQL,
      update: PongoUpdate<T> | SQL,
      options?: UpdateOneOptions,
    ): SQL => {
      const expectedVersionUpdate = versionCheckClause(
        collection.reference,
        options?.expectedVersion,
      );

      const filterQuery = isSQL(filter)
        ? filter
        : constructFilterQuery(filter, serializer);
      const updateQuery = isSQL(update)
        ? update
        : buildUpdateQuery(update, serializer);

      return SQL`
      WITH existing AS (
        SELECT _id, _version as current_version
        FROM ${collection.reference} ${where(filterQuery)}
        LIMIT 1
      ),
      updated AS (
        UPDATE ${collection.reference}
        SET
          data = ${updateQuery} || jsonb_build_object('_id', ${collection.reference}._id) || jsonb_build_object('_version', (_version + 1)::text),
          _version = _version + 1
        FROM existing
        WHERE ${collection.reference}._id = existing._id ${expectedVersionUpdate}
        RETURNING ${collection.reference}._id, ${collection.reference}._version
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
      const expectedVersionUpdate = versionCheckClause(
        collection.reference,
        options?.expectedVersion,
      );

      const filterQuery = isSQL(filter)
        ? filter
        : constructFilterQuery(filter, serializer);

      return SQL`
      WITH existing AS (
        SELECT _id, _version as current_version
        FROM ${collection.reference} ${where(filterQuery)}
        LIMIT 1
      ),
      updated AS (
        UPDATE ${collection.reference}
        SET
          data = ${JSONParam.document(document, serializer)} || jsonb_build_object('_id', ${collection.reference}._id) || jsonb_build_object('_version', (_version + 1)::text),
          _version = _version + 1
        FROM existing
        WHERE ${collection.reference}._id = existing._id ${expectedVersionUpdate}
        RETURNING ${collection.reference}._id, ${collection.reference}._version
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
      const filterQuery = isSQL(filter)
        ? filter
        : constructFilterQuery(filter, serializer);
      const updateQuery = isSQL(update)
        ? update
        : buildUpdateQuery(update, serializer);

      return SQL`
      UPDATE ${collection.reference}
      SET
        data = ${updateQuery} || jsonb_build_object('_version', (_version + 1)::text),
        _version = _version + 1
      ${where(filterQuery)};`;
    },
    deleteOne: <T>(
      filter: PongoFilter<T> | SQL,
      options?: DeleteOneOptions,
    ): SQL => {
      const expectedVersionUpdate = versionCheckClause(
        collection.reference,
        options?.expectedVersion,
      );

      const filterQuery = isSQL(filter)
        ? filter
        : constructFilterQuery(filter, serializer);

      return SQL`
      WITH existing AS (
        SELECT _id
        FROM ${collection.reference} ${where(filterQuery)}
        LIMIT 1
      ),
      deleted AS (
        DELETE FROM ${collection.reference}
        USING existing
        WHERE ${collection.reference}._id = existing._id ${expectedVersionUpdate}
        RETURNING ${collection.reference}._id
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
      const filterQuery = isSQL(filter)
        ? filter
        : constructFilterQuery(filter, serializer);

      return SQL`DELETE FROM ${collection.reference} ${where(filterQuery)}`;
    },
    replaceMany: <T>(
      documents: Array<WithIdAndVersion<T>> | Array<WithId<T>>,
    ): SQL => {
      const hasVersions = documents.some(
        (d) => '_version' in d && d._version !== undefined,
      );

      if (hasVersions) {
        const values = SQL.merge(
          documents.map((d) => {
            const expectedVersion = (d as WithIdAndVersion<T>)._version;
            return expectedVersion !== undefined
              ? SQL`(${d._id}::text, ${JSONParam.document(d, serializer)}::jsonb, ${expectedVersion}::bigint)`
              : SQL`(${d._id}::text, ${JSONParam.document(d, serializer)}::jsonb, NULL::bigint)`;
          }),
          ',',
        );
        return SQL`
        WITH replacements(_id, data, expected_version) AS (
          VALUES ${values}
        )
        UPDATE ${collection.reference} t
        SET
          data = r.data
            || jsonb_build_object('_id', t._id)
            || jsonb_build_object('_version', (t._version + 1)::text),
          _version = t._version + 1
        FROM replacements r
        WHERE t._id = r._id AND (r.expected_version IS NULL OR t._version = r.expected_version)
        RETURNING t._id, t._version AS version;`;
      }

      const values = SQL.merge(
        documents.map(
          (d) =>
            SQL`(${d._id}::text, ${JSONParam.document(d, serializer)}::jsonb)`,
        ),
        ',',
      );
      return SQL`
      WITH replacements(_id, data) AS (
        VALUES ${values}
      )
      UPDATE ${collection.reference} t
      SET
        data = r.data
          || jsonb_build_object('_id', t._id)
          || jsonb_build_object('_version', (t._version + 1)::text),
        _version = t._version + 1
      FROM replacements r
      WHERE t._id = r._id
      RETURNING t._id, t._version AS version;`;
    },
    deleteManyByIds: (ids: Array<{ _id: string; _version?: bigint }>): SQL => {
      const hasVersions = ids.some((d) => d._version !== undefined);

      if (hasVersions) {
        const values = SQL.merge(
          ids.map((d) => SQL`(${d._id}::text, ${d._version ?? 0n}::bigint)`),
          ',',
        );

        return SQL`
        WITH targets(_id, expected_version) AS (
          VALUES ${values}
        ),
        deleted AS (
          DELETE FROM ${collection.reference} t
          USING targets r
          WHERE t._id = r._id AND t._version = r.expected_version
          RETURNING t._id
        )
        SELECT r._id,
          CASE WHEN d._id IS NOT NULL THEN 1 ELSE 0 END as deleted
        FROM targets r
        LEFT JOIN deleted d ON r._id = d._id;`;
      }

      const values = SQL.merge(
        ids.map((d) => SQL`(${d._id}::text)`),
        ',',
      );

      return SQL`
      WITH targets(_id) AS (
        VALUES ${values}
      ),
      deleted AS (
        DELETE FROM ${collection.reference} t
        USING targets r
        WHERE t._id = r._id
        RETURNING t._id
      )
      SELECT r._id,
        CASE WHEN d._id IS NOT NULL THEN 1 ELSE 0 END as deleted
      FROM targets r
      LEFT JOIN deleted d ON r._id = d._id;`;
    },
    findOne: <T>(filter: PongoFilter<T> | SQL): SQL => {
      const filterQuery = isSQL(filter)
        ? filter
        : constructFilterQuery(filter, serializer);

      return SQL`SELECT data, _id, _version FROM ${collection.reference} ${where(filterQuery)} LIMIT 1;`;
    },
    find: <T>(filter: PongoFilter<T> | SQL, options?: FindOptions): SQL => {
      const filterQuery = isSQL(filter)
        ? filter
        : constructFilterQuery(filter, serializer);
      const query: SQL[] = [];

      query.push(SQL`SELECT data, _id, _version FROM ${collection.reference}`);

      query.push(where(filterQuery));

      if (options?.sort && Object.keys(options.sort).length > 0) {
        const clauses = Object.entries(options.sort).map(([field, dir]) => {
          const isMetadata = field === '_id' || field === '_version';
          // _id and _version are native columns, not JSON fields.
          // Use -> / #> (returns jsonb) rather than ->> / #>> (returns text) so
          // that numeric fields are sorted numerically, not lexicographically.
          const accessor = isMetadata
            ? SQL`${SQL.plain(field)}`
            : PostgreSQLJSON.field(SQL`data`, field);
          // Match MongoDB's null ordering: missing/null values sort first on ASC,
          // last on DESC. PostgreSQL's default is the opposite for ASC (NULLS LAST).
          return dir === 1
            ? SQL`${accessor} ASC NULLS FIRST`
            : SQL`${accessor} DESC NULLS LAST`;
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
      return SQL`SELECT COUNT(1) as count FROM ${collection.reference} ${where(filterQuery)};`;
    },
    rename: (newName: string): SQL =>
      SQL`ALTER TABLE ${collection.reference} RENAME TO ${SQL.identifier(newName)};`,
    drop: (targetName?: string): SQL =>
      targetName === undefined
        ? SQL`DROP TABLE IF EXISTS ${collection.reference}`
        : SQL`DROP TABLE IF EXISTS ${SQL.identifier(targetName)}`,
  };
};

const where = (filterQuery: SQL): SQL =>
  SQL.check.isEmpty(filterQuery)
    ? SQL.EMPTY
    : SQL.merge([SQL`WHERE `, filterQuery]);
