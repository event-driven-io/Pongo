import type { DatabaseMetadata } from '../../../../core';
import { tableExists } from './schema';

export const sqliteMetadata: DatabaseMetadata<false, false, false> = {
  databaseType: 'SQLite',
  defaultSchemaName: 'main',
  capabilities: {
    supportsSchemas: false,
    supportsFunctions: false,
    supportsMultipleDatabases: false,
  },
  tableExists,
};

dumboDatabaseMetadataRegistry.register('SQLite', sqliteMetadata);
