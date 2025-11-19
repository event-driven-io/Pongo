import { ColumnURN } from './columnSchemaComponent';
import { DatabaseURN } from './databaseSchemaComponent';
import { DatabaseSchemaURN } from './databaseSchemaSchemaComponent';
import { IndexURN } from './indexSchemaComponent';
import { TableURN } from './tableSchemaComponent';

export * from './columnSchemaComponent';
export * from './databaseSchemaComponent';
export * from './databaseSchemaSchemaComponent';
export * from './indexSchemaComponent';
export * from './tableSchemaComponent';
export * from './typeInference';

export const schemaComponentURN = {
  database: DatabaseURN,
  schema: DatabaseSchemaURN,
  table: TableURN,
  column: ColumnURN,
  index: IndexURN,
  extractName: (urn: string): string => {
    const parts = urn.split(':');
    return parts[parts.length - 1] || '';
  },
} as const;
