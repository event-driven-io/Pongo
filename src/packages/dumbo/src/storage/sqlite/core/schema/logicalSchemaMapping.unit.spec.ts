import assert from 'node:assert';
import { describe, it } from 'vitest';
import {
  databaseSchemaComponent,
  databaseSchemaSchemaComponent,
  featureSchemaComponent,
  tableSchemaComponent,
} from '../../../../core';
import { DefaultSQLiteMigratorOptions } from './migrations';

describe('SQLite logical schema mapping', () => {
  it('validates expanded database schema components in strict mode', () => {
    const feature = featureSchemaComponent({
      featureKind: 'tenant_storage',
      featureName: 'audit',
      components: [
        databaseSchemaSchemaComponent({
          schemaName: 'audit',
          tables: {
            users: tableSchemaComponent({ tableName: 'users' }),
          },
        }),
      ],
    });
    const database = databaseSchemaComponent({
      databaseName: 'app',
      schemas: {
        public: databaseSchemaSchemaComponent({
          schemaName: 'public',
          tables: {
            users: tableSchemaComponent({ tableName: 'users' }),
          },
        }),
      },
      components: [feature],
    });

    assert.throws(
      () => DefaultSQLiteMigratorOptions.schema?.validateComponent?.(database),
      /Logical schema collision detected: users/,
    );
  });
});
