import type { DatabaseMetadata } from '../../../../core';
import { tableExists } from './schema';

export const sqliteMetadata = {
  databaseType: 'SQLite',
  defaultDatabaseName: 'main',
  defaultSchemaName: 'main',
  capabilities: {
    supportsSchemas: false,
    supportsFunctions: false,
    supportsMultipleDatabases: false,
  },
  tableExists,
} as const satisfies DatabaseMetadata<false, false, false>;

dumboDatabaseMetadataRegistry.register('SQLite', sqliteMetadata);
