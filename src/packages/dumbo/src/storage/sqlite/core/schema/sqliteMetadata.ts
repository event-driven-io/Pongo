import {
  dumboDatabaseMetadataRegistry,
  type DatabaseMetadata,
} from '../../../../core';
import { tableExists } from './schema';

export const sqliteMetadata = {
  databaseType: 'SQLite',
  defaultDatabaseName: 'main',
  capabilities: {
    supportsSchemas: false,
    supportsFunctions: false,
    supportsMultipleDatabases: false,
    supportsTransactions: true,
  },
  tableExists,
} as const satisfies DatabaseMetadata<false, false, false, true>;

dumboDatabaseMetadataRegistry.register('SQLite', sqliteMetadata);
