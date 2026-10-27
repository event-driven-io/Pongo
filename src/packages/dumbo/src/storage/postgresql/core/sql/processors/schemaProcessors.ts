import {
  DefaultDatabaseSchemaName,
  isDefaultDatabaseSchema,
  processSQLToken,
  SQLIdentifier,
  SQLProcessor,
  type SQLCreateSchema,
  type SQLIndexReference,
  type SQLJSONDocumentIndexTarget,
  type SQLJSONPathTarget,
  type SQLProcessorContext,
  type SQLRenameTable,
  type SQLTableReference,
} from '../../../../../core';
import { PostgreSQLJSON } from '../json';

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
    handle: ({ databaseSchemaName, tableName }, context) => {
      if (!isDefaultDatabaseSchema(databaseSchemaName)) {
        addIdentifier(databaseSchemaName, context);
        context.builder.addSQL('.');
      }
      addIdentifier(tableName, context);
    },
  });

export const PostgreSQLRenameTableProcessor: SQLProcessor<SQLRenameTable> =
  SQLProcessor({
    canHandle: 'SQL_RENAME_TABLE',
    handle: (token, context) => {
      context.builder.addSQL('ALTER TABLE ');
      processSQLToken(token.table, context);
      context.builder.addSQL(' RENAME TO ');
      addIdentifier(token.newTableName, context);
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
      if (token.databaseSchemaName === DefaultDatabaseSchemaName) return;

      context.builder.addSQL('CREATE SCHEMA IF NOT EXISTS ');
      addIdentifier(token.databaseSchemaName, context);
    },
  });
