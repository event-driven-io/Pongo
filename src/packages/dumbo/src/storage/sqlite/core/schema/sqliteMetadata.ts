import type { DatabaseMetadata } from '../../../../core';
import { tableExists } from './schema';

export const sqliteMetadata: DatabaseMetadata<false, false, false> = {
  databaseType: 'SQLite',
  capabilities: {
    supportsSchemas: false,
    supportsFunctions: false,
    supportsMultipleDatabases: false,
  },
  tableExists,
};

dumboDatabaseMetadataRegistry.register('SQLite', sqliteMetadata);
