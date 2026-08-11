import {
  SQL,
  SQLTableReference,
  type SQLDefaultSchemaNameToken,
} from '../../../../core';

export const postgreSQLTableReference = (
  identifier: Readonly<{
    databaseSchemaName: string | SQLDefaultSchemaNameToken;
    tableName: string;
  }>,
): SQL => SQL`${SQLTableReference.from(identifier)}`;
