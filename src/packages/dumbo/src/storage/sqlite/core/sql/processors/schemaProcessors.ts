import {
  SQLIdentifier,
  SQLProcessor,
  type SQLCreateSchema,
  type SQLTableReference,
} from '../../../../../core';
import { sqliteTableName } from '../../schema/sqlitePhysicalNames';

export const SQLiteTableReferenceProcessor: SQLProcessor<SQLTableReference> =
  SQLProcessor({
    canHandle: 'SQL_TABLE_REFERENCE',
    handle: (token, { builder, mapper, serializer }) =>
      builder.addSQL(
        mapper.mapValue(
          SQLIdentifier.from(sqliteTableName(token)),
          serializer,
        ) as string,
      ),
  });

// SQLite has no schemas — a logical schema lives in the mapped table name
export const SQLiteCreateSchemaProcessor: SQLProcessor<SQLCreateSchema> =
  SQLProcessor({
    canHandle: 'SQL_CREATE_SCHEMA',
    handle: () => {},
  });
