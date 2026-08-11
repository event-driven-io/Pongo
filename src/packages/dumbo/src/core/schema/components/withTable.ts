import type { SQLDefaultSchemaNameToken } from '../../sql';
import {
  databaseComponent,
  databaseSchemaKey,
  type AnyDatabaseComponent,
} from './databaseComponent';
import { databaseSchemaComponent } from './databaseSchemaComponent';
import type { AnyTableComponent } from './tableComponent';

export const withTable = (
  database: AnyDatabaseComponent,
  databaseSchemaName: string | SQLDefaultSchemaNameToken,
  alias: string,
  table: AnyTableComponent,
): AnyDatabaseComponent => {
  const key = databaseSchemaKey(databaseSchemaName);
  const existingSchema = database.schemas[key];
  const schema = databaseSchemaComponent({
    schemaName: databaseSchemaName,
    tables: {
      ...(existingSchema?.tables ?? {}),
      [alias]: table,
    },
    extensions: existingSchema?.extensions,
  });

  return databaseComponent({
    databaseName: database.databaseName,
    schemas: {
      ...database.schemas,
      [key]: schema,
    },
    extensions: database.extensions,
  });
};
