import {
  SQLDefaultSchemaNameToken,
  SQLIdentifier,
  SQLProcessor,
  type SQLCreateSchema,
  type SQLProcessorContext,
  type SQLTableReference,
} from '../../../../../core';
import { postgreSQLMetadata } from '../../schema/postgreSQLMetadata';

const isDefaultSchema = (
  databaseSchemaName: string | SQLDefaultSchemaNameToken,
): boolean =>
  SQLDefaultSchemaNameToken.check(databaseSchemaName) ||
  databaseSchemaName === postgreSQLMetadata.defaultSchemaName;

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

export const PostgreSQLCreateSchemaProcessor: SQLProcessor<SQLCreateSchema> =
  SQLProcessor({
    canHandle: 'SQL_CREATE_SCHEMA',
    handle: (token, context) => {
      if (isDefaultSchema(token.databaseSchemaName)) return;

      context.builder.addSQL('CREATE SCHEMA IF NOT EXISTS ');
      addIdentifier(token.databaseSchemaName as string, context);
    },
  });
