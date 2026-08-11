import {
  SQLDefaultSchemaNameToken,
  SQLIdentifier,
  SQLProcessor,
  type SQLCreateSchema,
  type SQLIndexReference,
  type SQLJSONDocumentIndexTarget,
  type SQLJSONPathTarget,
  type SQLProcessorContext,
  type SQLTableReference,
} from '../../../../../core';
import { PostgreSQLJSON } from '../json';

const isDefaultSchema = (
  databaseSchemaName: string | SQLDefaultSchemaNameToken,
): boolean => SQLDefaultSchemaNameToken.check(databaseSchemaName);

const addIdentifier = (
  name: string,
  { builder, mapper, serializer }: SQLProcessorContext,
): void => {
  builder.addSQL(
    mapper.mapValue(SQLIdentifier.from(name), serializer) as string,
  );
};

export const PostgreSQLTableReferenceProcessor: SQLProcessor<SQLTableReference> =
  SQLProcessor({
    canHandle: 'SQL_TABLE_REFERENCE',
    handle: (token, context) => {
      if (!isDefaultSchema(token.databaseSchemaName)) {
        addIdentifier(token.databaseSchemaName as string, context);
        context.builder.addSQL('.');
      }
      addIdentifier(token.tableName, context);
    },
  });

export const PostgreSQLIndexReferenceProcessor: SQLProcessor<SQLIndexReference> =
  SQLProcessor({
    canHandle: 'SQL_INDEX_REFERENCE',
    handle: (token, context) => addIdentifier(token.indexName, context),
  });

const jsonDocumentIndexOpening = (isUnique: boolean): string =>
  isUnique ? '(' : 'USING GIN (';

export const PostgreSQLJSONDocumentIndexTargetProcessor: SQLProcessor<SQLJSONDocumentIndexTarget> =
  SQLProcessor({
    canHandle: 'SQL_JSON_DOCUMENT_INDEX_TARGET',
    handle: (token, context) => {
      context.builder.addSQL(jsonDocumentIndexOpening(token.isUnique));
      addIdentifier(token.columnName, context);
      context.builder.addSQL(')');
    },
  });

export const PostgreSQLJSONPathTargetProcessor: SQLProcessor<SQLJSONPathTarget> =
  SQLProcessor({
    canHandle: 'SQL_JSON_PATH_TARGET',
    handle: (token, context) => {
      context.builder.addSQL('((');
      addIdentifier(token.columnName, context);
      context.builder.addSQL(` #>> ${PostgreSQLJSON.path(token.path).value}))`);
    },
  });

export const PostgreSQLCreateSchemaProcessor: SQLProcessor<SQLCreateSchema> =
  SQLProcessor({
    canHandle: 'SQL_CREATE_SCHEMA',
    handle: (token, context) => {
      if (isDefaultSchema(token.databaseSchemaName)) return;

      context.builder.addSQL('CREATE SCHEMA IF NOT EXISTS ');
      addIdentifier(token.databaseSchemaName as string, context);
    },
  });
