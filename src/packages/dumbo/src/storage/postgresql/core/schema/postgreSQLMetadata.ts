import {
  dumboDatabaseMetadataRegistry,
  type DatabaseMetadata,
} from '../../../../core';
import { parseDatabaseName } from '../connections';
import {
  defaultPostgreSqlDatabase,
  functionExists,
  tableExists,
} from './schema';

export const postgreSQLMetadata: DatabaseMetadata<true, true, true, true> = {
  databaseType: 'PostgreSQL',
  defaultDatabaseName: defaultPostgreSqlDatabase,
  capabilities: {
    supportsSchemas: true,
    supportsFunctions: true,
    supportsMultipleDatabases: true,
    supportsTransactions: true,
  },
  tableExists,
  functionExists,
  parseDatabaseName: (connectionString?: string) =>
    (connectionString ? parseDatabaseName(connectionString) : null) ??
    defaultPostgreSqlDatabase,
};

dumboDatabaseMetadataRegistry.register('PostgreSQL', postgreSQLMetadata);
