import {
  databaseComponent,
  type AnyDatabaseComponent,
} from './databaseComponent';
import { databaseSchemaComponent } from './databaseSchemaComponent';
import type { AnyTableComponent } from './tableComponent';

export const withTable = (
  database: AnyDatabaseComponent,
  databaseSchemaName: string,
  alias: string,
  table: AnyTableComponent,
): AnyDatabaseComponent => {
  const existingSchema = database.schemas[databaseSchemaName];
  const schema = databaseSchemaComponent({
    schemaName: databaseSchemaName,
    databaseName: existingSchema?.databaseName,
    tables: {
      ...(existingSchema?.tables ?? {}),
      [alias]: table,
    },
    extensions: existingSchema?.extensions,
    migrations: existingSchema?.declare,
  });

  return databaseComponent({
    databaseName: database.databaseName,
    schemas: {
      ...database.schemas,
      [databaseSchemaName]: schema,
    },
    extensions: database.extensions,
    migrations: database.declare,
  });
};
