import {
  SQLIdentifier,
  SQLProcessor,
  type SQLCreateSchema,
  type SQLIndexReference,
  type SQLJSONDocumentIndexTarget,
  type SQLJSONPathTarget,
  type SQLProcessorContext,
  type SQLTableReference,
} from '../../../../../core';
import {
  sqliteIndexName,
  sqliteTableName,
} from '../../schema/sqlitePhysicalNames';
import { SQLiteJSON } from '../json';

const addIdentifier = (
  name: string,
  { builder, mapper, serializer }: SQLProcessorContext,
): void => {
  builder.addSQL(
    mapper.mapValue(SQLIdentifier.from(name), serializer) as string,
  );
};

export const SQLiteTableReferenceProcessor: SQLProcessor<SQLTableReference> =
  SQLProcessor({
    canHandle: 'SQL_TABLE_REFERENCE',
    handle: (token, context) => addIdentifier(sqliteTableName(token), context),
  });

export const SQLiteIndexReferenceProcessor: SQLProcessor<SQLIndexReference> =
  SQLProcessor({
    canHandle: 'SQL_INDEX_REFERENCE',
    handle: (token, context) => addIdentifier(sqliteIndexName(token), context),
  });

export const SQLiteJSONDocumentIndexTargetProcessor: SQLProcessor<SQLJSONDocumentIndexTarget> =
  SQLProcessor({
    canHandle: 'SQL_JSON_DOCUMENT_INDEX_TARGET',
    handle: (token, context) => {
      context.builder.addSQL('(');
      addIdentifier(token.columnName, context);
      context.builder.addSQL(')');
    },
  });

export const SQLiteJSONPathTargetProcessor: SQLProcessor<SQLJSONPathTarget> =
  SQLProcessor({
    canHandle: 'SQL_JSON_PATH_TARGET',
    handle: (token, context) => {
      context.builder.addSQL('(json_extract(');
      addIdentifier(token.columnName, context);
      context.builder.addSQL(`, ${SQLiteJSON.path(token.path).value}))`);
    },
  });

// SQLite has no schemas — a logical schema lives in the mapped table name
export const SQLiteCreateSchemaProcessor: SQLProcessor<SQLCreateSchema> =
  SQLProcessor({
    canHandle: 'SQL_CREATE_SCHEMA',
    handle: () => {},
  });
